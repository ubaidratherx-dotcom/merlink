import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

interface ValidateOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Returns Express middleware that validates `req.body`, `req.query`, and/or
 * `req.params` against the provided Zod schemas.
 *
 * Usage:
 * ```ts
 * router.post("/items", validate({ body: createItemSchema }), createItem);
 * ```
 */
export function validate(schemas: ValidateOptions | ZodSchema) {
  // Allow passing a single schema (treated as body validation)
  const opts: ValidateOptions =
    schemas instanceof ZodSchema ? { body: schemas } : schemas;

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (opts.body) {
        req.body = opts.body.parse(req.body);
      }
      if (opts.query) {
        req.query = opts.query.parse(req.query) as typeof req.query;
      }
      if (opts.params) {
        req.params = opts.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: err.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(err);
    }
  };
}
