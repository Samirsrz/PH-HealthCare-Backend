import z from "zod"

export const BookAppointmentValidationZodSchema = z.object({
    scheduleId: z.string().min(1,"Schedule Id is required")
})

export const UpdateAppointmentStatusValidationZodSchema = z.object({
    status: z.enum(
        ["ONGOING", "COMPLETED"],
        "Status must be either ONGOING or COMPLETED"
    )
})