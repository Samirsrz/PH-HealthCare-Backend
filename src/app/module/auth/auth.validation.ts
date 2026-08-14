import z from "zod";

// ZOD SANITIZATION
export const PatientRegistrationZodSchema =  z.object({
	name:z.string("Not a string!!!!!").min(3,"Name Should contain atleast 3 characters!!").max(10,"maximum can contain 10 characters!!"),
	email:z.string(),
	password:z.string()
	.min(6, "Password must be at least 6 characters")
  	.regex(/[A-Z]/,"Password must contain 1 uppercase character")
  	.regex(/[a-z]/,"Password must contain 1 lowercase character")
  	.regex(/[0-9]/,"Password must contain 1 numerical character")
  	.regex(/[^A-Za-z0-9]/,"Password must contain 1 special character"),
	patient: z.object({
		contactNumber: z.string().optional()
	}).optional()
})

export const LoginZodSchema = z.object({
    email:z.email(),
    password:z.string()
	.min(6, "Password must be at least 6 characters")
  	.regex(/[A-Z]/,"Password must contain 1 uppercase character")
  	.regex(/[a-z]/,"Password must contain 1 lowercase character")
  	.regex(/[0-9]/,"Password must contain 1 numerical character")
  	.regex(/[^A-Za-z0-9]/,"Password must contain 1 special character")
	
})

export const ForgotPasswordZodSchema = z.object({
	email:z.email(),
})





export const ResetPasswordZodSchema = z.object({

    email:z.email(),
    newPassword:z.string()
	.min(6, "Password must be at least 6 characters")
  	.regex(/[A-Z]/,"Password must contain 1 uppercase character")
  	.regex(/[a-z]/,"Password must contain 1 lowercase character")
  	.regex(/[0-9]/,"Password must contain 1 numerical character")
  	.regex(/[^A-Za-z0-9]/,"Password must contain 1 special character"),
	opt:z.string().length(6)
	
})