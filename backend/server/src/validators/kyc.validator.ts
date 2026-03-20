import { z } from "zod";

export const createApplicantSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

export const webhookSchema = z.object({
  type: z.string().min(1, "Event type is required"),
  applicantId: z.string().min(1, "Applicant ID is required"),
  externalUserId: z.string().min(1, "External user ID is required"),
  reviewResult: z
    .object({
      reviewAnswer: z.string(),
      rejectLabels: z.array(z.string()).optional(),
      moderationComment: z.string().optional(),
    })
    .optional(),
});
