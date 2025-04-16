import { z } from 'zod';

const password_regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\/-]).*$/

export const updateUserSchema = z.object({
      fullname: z.object({
        firstName: z.string().max(14),
        lastName: z.string().max(14),
      }),
  });

// export const signUpSchema = z.object({
//   signupData: z.object({
//     email: z.string().email("Invalid email address"),
//     password: z.string()
//     .min(8, 'Password must be at least 8 characters')
//     .regex(password_regex,'Password requires uppercase, number, and special character'),
//     fullname: z.object({
//       firstName: z.string().max(14, "First name must be at most 14 characters"),
//       lastName: z.string().max(14, "Last name must be at most 14 characters"),
//     }),
//   }),
// })

// export const verifyEmailSchema = z.object({
//   email: z.string().email("Invalid email address"),
// })

// export const verifyPasswordSchema = z.object({ 
//   password: z.string()
//   .min(8, 'Password must be at least 8 characters')
//   .regex(password_regex,'Password requires uppercase, number, and special character'),
//   confirmPassword: z.string()
//   .min(8, 'Password must be at least 8 characters')
//   .regex(password_regex,'Password requires uppercase, number, and special character'),
// })