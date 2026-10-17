import mongoose from "mongoose";

// JSON output for every model: `id` instead of `_id`, no `__v`, and never a password hash.
mongoose.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
});

export const baseOptions = { timestamps: true } as const;
