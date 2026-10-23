use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::pubkey;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint, CloseAccount};

declare_id!("Drf9Tcbz3nDjhhyE3dGP9NvBcdLDb9QEMxW8rqMdVMvX");

// Admin wallet — only this key can resolve disputes
const ADMIN: Pubkey = pubkey!("EJhPhzqWsNvwuWBTpyUViuuc5Gh2AwiYEwSCT7rzHnuJ");

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub trade_id: [u8; 32],
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub is_sol: bool,
    pub mint: Pubkey,
    pub is_locked: bool,
    pub is_released: bool,
    pub is_cancelled: bool,
    pub is_disputed: bool,
    pub payment_marked: bool,
    pub bump: u8,
}

#[program]
pub mod merlink_escrow {
    use super::*;

    /// Lock native SOL into escrow
    pub fn lock_sol(ctx: Context<LockSol>, trade_id: [u8; 32], amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        // HIGH FIX: Self-trade prevention
        require!(ctx.accounts.buyer.key() != ctx.accounts.seller.key(), EscrowError::SelfTrade);

        let escrow = &mut ctx.accounts.escrow;
        escrow.trade_id = trade_id;
        escrow.seller = ctx.accounts.seller.key();
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.amount = amount;
        escrow.is_sol = true;
        escrow.mint = Pubkey::default();
        escrow.is_locked = true;
        escrow.is_released = false;
        escrow.is_cancelled = false;
        escrow.is_disputed = false;
        escrow.payment_marked = false;
        escrow.bump = ctx.bumps.escrow;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.seller.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("SOL escrow locked: {} lamports", amount);
        Ok(())
    }

    /// Lock SPL tokens (USDC) into escrow
    pub fn lock_token(ctx: Context<LockToken>, trade_id: [u8; 32], amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        require!(ctx.accounts.buyer.key() != ctx.accounts.seller.key(), EscrowError::SelfTrade);

        let escrow = &mut ctx.accounts.escrow;
        escrow.trade_id = trade_id;
        escrow.seller = ctx.accounts.seller.key();
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.amount = amount;
        escrow.is_sol = false;
        escrow.mint = ctx.accounts.mint.key();
        escrow.is_locked = true;
        escrow.is_released = false;
        escrow.is_cancelled = false;
        escrow.is_disputed = false;
        escrow.payment_marked = false;
        escrow.bump = ctx.bumps.escrow;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("Token escrow locked: {} units", amount);
        Ok(())
    }

    /// Release SOL escrow to buyer
    pub fn release_sol(ctx: Context<ReleaseSol>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(!escrow.is_disputed, EscrowError::IsDisputed);

        // Transfer locked amount to buyer, rent back to seller
        let amount = escrow.amount;
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let total_lamports = escrow_info.lamports();

        // Send locked amount to buyer
        **escrow_info.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.buyer.to_account_info().try_borrow_mut_lamports()? += amount;

        // Send remaining rent to seller (effectively closing account)
        let remaining = escrow_info.lamports();
        **escrow_info.try_borrow_mut_lamports()? -= remaining;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += remaining;

        msg!("SOL escrow released to buyer: {} lamports, rent {} returned to seller", amount, remaining);
        Ok(())
    }

    /// Release token escrow to buyer
    pub fn release_token(ctx: Context<ReleaseToken>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(!escrow.is_disputed, EscrowError::IsDisputed);

        let trade_id = escrow.trade_id;
        let bump = escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", trade_id.as_ref(), &[bump]]];

        let amount = ctx.accounts.escrow_token_account.amount;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        // HIGH FIX: Close the escrow token account, return rent to seller
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.is_released = true;
        msg!("Token escrow released to buyer: {} units", amount);
        Ok(())
    }

    /// Cancel SOL escrow — blocked after payment marked
    pub fn cancel_sol(ctx: Context<CancelSol>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(!escrow.is_disputed, EscrowError::IsDisputed);
        require!(!escrow.payment_marked, EscrowError::PaymentAlreadySent);

        // Return everything (amount + rent) to seller
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let total = escrow_info.lamports();
        **escrow_info.try_borrow_mut_lamports()? -= total;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += total;

        msg!("SOL escrow cancelled, {} lamports returned to seller", total);
        Ok(())
    }

    /// Cancel token escrow — blocked after payment marked
    pub fn cancel_token(ctx: Context<CancelToken>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(!escrow.is_disputed, EscrowError::IsDisputed);
        require!(!escrow.payment_marked, EscrowError::PaymentAlreadySent);

        let trade_id = escrow.trade_id;
        let bump = escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", trade_id.as_ref(), &[bump]]];

        let amount = ctx.accounts.escrow_token_account.amount;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        // Close token account
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.is_cancelled = true;
        msg!("Token escrow cancelled, {} units returned", amount);
        Ok(())
    }

    /// Buyer marks fiat payment as sent — blocks seller from cancelling
    pub fn mark_payment_sent(ctx: Context<MarkPaymentSent>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(!escrow.payment_marked, EscrowError::PaymentAlreadyMarked);
        require!(ctx.accounts.buyer.key() == escrow.buyer, EscrowError::Unauthorized);

        escrow.payment_marked = true;
        msg!("Payment marked as sent by buyer");
        Ok(())
    }

    /// Mark escrow as disputed — buyer, seller, or admin can call
    pub fn mark_disputed(ctx: Context<MarkDisputed>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(!escrow.is_disputed, EscrowError::AlreadyDisputed);

        let caller = ctx.accounts.caller.key();
        require!(
            caller == escrow.seller || caller == escrow.buyer || caller == ADMIN,
            EscrowError::Unauthorized
        );

        escrow.is_disputed = true;
        msg!("Escrow marked as disputed");
        Ok(())
    }

    /// Admin resolves dispute — release SOL to buyer
    pub fn dispute_release_sol(ctx: Context<DisputeResolveSol>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(escrow.is_disputed, EscrowError::NotDisputed);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(ctx.accounts.admin.key() == ADMIN, EscrowError::NotAdmin);

        let amount = escrow.amount;
        let escrow_info = ctx.accounts.escrow.to_account_info();

        // Send amount to buyer
        **escrow_info.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.buyer.to_account_info().try_borrow_mut_lamports()? += amount;

        // Send remaining rent to seller
        let remaining = escrow_info.lamports();
        **escrow_info.try_borrow_mut_lamports()? -= remaining;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += remaining;

        msg!("Admin dispute release: {} lamports to buyer", amount);
        Ok(())
    }

    /// Admin resolves dispute — refund SOL to seller
    pub fn dispute_cancel_sol(ctx: Context<DisputeResolveSol>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(escrow.is_disputed, EscrowError::NotDisputed);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(ctx.accounts.admin.key() == ADMIN, EscrowError::NotAdmin);

        // Return everything to seller (amount + rent)
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let total = escrow_info.lamports();
        **escrow_info.try_borrow_mut_lamports()? -= total;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += total;

        msg!("Admin dispute cancel: {} lamports to seller", total);
        Ok(())
    }

    /// Admin resolves dispute — release tokens to buyer
    pub fn dispute_release_token(ctx: Context<DisputeResolveToken>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(escrow.is_disputed, EscrowError::NotDisputed);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(ctx.accounts.admin.key() == ADMIN, EscrowError::NotAdmin);

        let trade_id = escrow.trade_id;
        let bump = escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", trade_id.as_ref(), &[bump]]];

        let amount = ctx.accounts.escrow_token_account.amount;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.is_released = true;
        msg!("Admin dispute release: {} tokens to buyer", amount);
        Ok(())
    }

    /// Admin resolves dispute — refund tokens to seller
    pub fn dispute_cancel_token(ctx: Context<DisputeResolveToken>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.is_sol, EscrowError::WrongEscrowType);
        require!(escrow.is_locked, EscrowError::NotLocked);
        require!(escrow.is_disputed, EscrowError::NotDisputed);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require!(ctx.accounts.admin.key() == ADMIN, EscrowError::NotAdmin);

        let trade_id = escrow.trade_id;
        let bump = escrow.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"escrow", trade_id.as_ref(), &[bump]]];

        let amount = ctx.accounts.escrow_token_account.amount;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer_seeds,
        ))?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.is_cancelled = true;
        msg!("Admin dispute cancel: {} tokens to seller", amount);
        Ok(())
    }
}

// ═══════════════════════════════════════════════════════════════
// SOL account contexts
// ═══════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(trade_id: [u8; 32])]
pub struct LockSol<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: buyer pubkey stored in escrow, validated != seller
    pub buyer: UncheckedAccount<'info>,

    #[account(
        init,
        payer = seller,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", trade_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseSol<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: validated by has_one
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,

    // HIGH FIX: close = seller returns rent to seller after release
    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
        has_one = seller,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelSol<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    // HIGH FIX: close = seller returns rent
    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
        has_one = seller,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

// ═══════════════════════════════════════════════════════════════
// Token account contexts
// ═══════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(trade_id: [u8; 32])]
pub struct LockToken<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: buyer pubkey stored in escrow, validated != seller
    pub buyer: UncheckedAccount<'info>,

    #[account(
        init,
        payer = seller,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", trade_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    // Escrow token account — must be pre-created as ATA for escrow PDA
    #[account(
        mut,
        token::mint = mint,
        token::authority = escrow,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseToken<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: validated by has_one
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,

    // HIGH FIX: close = seller returns rent
    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
        has_one = seller,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,

    // HIGH FIX: validate mint matches escrow.mint
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = escrow,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    // HIGH FIX: validate mint matches escrow.mint
    #[account(
        mut,
        token::mint = escrow.mint,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelToken<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    // HIGH FIX: close = seller
    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
        has_one = seller,
    )]
    pub escrow: Account<'info, Escrow>,

    // HIGH FIX: validate mint
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = escrow,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    // HIGH FIX: validate mint
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ═══════════════════════════════════════════════════════════════
// Payment + Dispute account contexts
// ═══════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct MarkPaymentSent<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct MarkDisputed<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct DisputeResolveSol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: validated against escrow.seller
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    /// CHECK: validated against escrow.buyer
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,

    // HIGH FIX: close = seller
    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
        has_one = seller,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DisputeResolveToken<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: validated against escrow.seller
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    /// CHECK: validated against escrow.buyer
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,

    // HIGH FIX: close = seller
    #[account(
        mut,
        seeds = [b"escrow", escrow.trade_id.as_ref()],
        bump = escrow.bump,
        has_one = seller,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,

    // HIGH FIX: validate mint
    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = escrow,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    // HIGH FIX: validate mint
    #[account(
        mut,
        token::mint = escrow.mint,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = escrow.mint,
        token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ═══════════════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════════════

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Escrow is not locked")]
    NotLocked,
    #[msg("Escrow has already been released")]
    AlreadyReleased,
    #[msg("Escrow has already been cancelled")]
    AlreadyCancelled,
    #[msg("Escrow is under dispute — use dispute resolution")]
    IsDisputed,
    #[msg("Escrow is already disputed")]
    AlreadyDisputed,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Escrow is not under dispute")]
    NotDisputed,
    #[msg("Only the admin can resolve disputes")]
    NotAdmin,
    #[msg("Wrong escrow type (SOL vs Token mismatch)")]
    WrongEscrowType,
    #[msg("Cannot cancel after payment has been marked as sent")]
    PaymentAlreadySent,
    #[msg("Payment has already been marked")]
    PaymentAlreadyMarked,
    #[msg("Cannot trade with yourself")]
    SelfTrade,
}
