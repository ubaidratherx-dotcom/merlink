"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { api } from "@/lib/api";
import type { User } from "@merlink/types";
import styles from "./page.module.css";

export default function EditProfilePage() {
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState((user as any)?.bio || "");
  const [photoPreview, setPhotoPreview] = useState(user?.profilePhoto || "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be under 5MB");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      // Upload photo if changed (upload service saves to DB automatically)
      if (photoFile) {
        const uploadResult = await api.upload.profilePhoto(photoFile);
        const newPhotoUrl = uploadResult.url || uploadResult.profilePhoto;
        updateUser({ profilePhoto: newPhotoUrl } as Partial<User>);
      }

      // Update other profile fields
      const updates: Record<string, any> = {};
      if (username !== user?.username) updates.username = username;
      if (bio !== ((user as any)?.bio || "")) updates.bio = bio;

      if (Object.keys(updates).length > 0) {
        const updated = await api.users.updateProfile(updates);
        updateUser(updated as Partial<User>);
      }

      setSuccess(true);
      setTimeout(() => router.push("/profile"), 1000);
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  const hasChanges =
    username !== (user?.username || "") ||
    bio !== ((user as any)?.bio || "") ||
    photoFile !== null;

  return (
    <div className={styles.container}>
      <Link href="/profile" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Profile
      </Link>

      <h1 className={styles.heading}>Edit Profile</h1>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>Profile updated!</div>}

      {/* Photo */}
      <div className={styles.photoSection}>
        <button
          type="button"
          className={styles.photoButton}
          onClick={() => fileInputRef.current?.click()}
        >
          {photoPreview ? (
            <img src={photoPreview} alt="Profile" className={styles.photoImage} />
          ) : (
            <div className={styles.photoPlaceholder}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}
          <div className={styles.photoBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelect}
          style={{ display: "none" }}
        />
        <span className={styles.photoHint}>Tap to change photo</span>
      </div>

      {/* Username */}
      <div className={styles.field}>
        <label className={styles.label}>Username</label>
        <input
          type="text"
          className={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          maxLength={20}
          placeholder="your_username"
        />
        <span className={styles.hint}>{username.length}/20 — lowercase, numbers, underscore only</span>
      </div>

      {/* Bio */}
      <div className={styles.field}>
        <label className={styles.label}>Bio</label>
        <textarea
          className={styles.textarea}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={250}
          rows={3}
          placeholder="Tell other traders about yourself..."
        />
        <span className={styles.hint}>{bio.length}/250</span>
      </div>

      {/* Save */}
      <button
        className={styles.saveButton}
        onClick={handleSave}
        disabled={saving || !hasChanges || !username.trim()}
      >
        {saving ? "Saving..." : success ? "Saved!" : "Save Changes"}
      </button>
    </div>
  );
}
