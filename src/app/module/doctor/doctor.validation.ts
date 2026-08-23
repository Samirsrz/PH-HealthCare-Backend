import { z } from "zod";

export const ApplyAsDoctorValidationSchema = z.object({
    user: z.object({
        name: z.string({ error: "Name is required" })
            .min(2, "Name must be at least 2 characters")
            .max(100, "Name must not exceed 100 characters"),
        email: z.email({ error: "Invalid email address" }),
    }),
    doctor: z.object({
        address: z.string().optional(),
        specialization: z.string({ error: "Specialization is required" })
            .min(2, "Specialization must be at least 2 characters"),
        licenseNumber: z.string({ error: "License number is required" })
            .min(3, "License number must be at least 3 characters"),
        qualifications: z.string({ error: "Qualifications are required" })
            .min(2, "Qualifications must be at least 2 characters"),
        experienceYears: z.coerce.number({ error: "Experience years is required" })
            .int("Experience years must be an integer")
            .min(0, "Experience years cannot be negative")
            .max(70, "Experience years seems invalid"),
        bio: z.string().max(1000, "Bio must not exceed 1000 characters").optional(),
        consultationFee: z.coerce.number()
            .min(0, "Consultation fee cannot be negative")
            .optional(),
        contactNumber: z.string()
            .regex(/^[+]?[\d\s-]{7,15}$/, "Invalid contact number")
            .optional(),
    }),
});