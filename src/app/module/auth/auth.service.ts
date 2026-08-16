/** biome-ignore-all lint/style/useConst: <explanation> */
import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { AuthProvider, Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
	IForgotPassword,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPassword,
	IVerifyEmailPayload,
} from "./auth.interface";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";
import crypto from "crypto"
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodeMailer";
import ejs from "ejs"
import path from "path"


const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password,patient:patientData } = payload;
 
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new Error("User with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(password, 8);


//    Redis e data store korbo

    const otpValue  = crypto.randomInt(100000,1000000).toString() 
    const otpKey = `patient-registration-otp:${email}`
	  await redisClient.set(otpKey,otpValue,{
		expiration:{
			type:"EX",
			value: 5 * 60
		}
	  })


	const patientRegistrationKey = `patient-registration-data:${email}` 
    const redisUserDataPayload = {
	  name,
	  email,
	  password:hashedPassword,
	  patient:patientData
   }
    
       await redisClient.set(patientRegistrationKey,JSON.stringify(redisUserDataPayload),{
		expiration:{
			type:"EX",
			value: 5 * 60
		}
	  })

	//   Sending Mail PART
	  const templatePath = path.join(process.cwd(),"src/app/templates/registrationOTP.ejs")
      const html = await ejs.renderFile(templatePath,{
		name,
		email,
		otp:otpValue,
		expirationMinutes:5
	  },{cache:false})

    await transporter.sendMail({
		from:config.smtp_user,
		to: email,
		subject:"Email Verification",
		// text:`Your otp is ${otp}`
		html
	})


	// const createdUser = await prisma.user.create({
	// 	data: {
	// 		name,
	// 		email,
	// 		password: hashedPassword,
	// 		role: Role.PATIENT,
	// 		status: UserStatus.ACTIVE,
	// 		emailVerified: false,
	// 		patient: {
	// 			create: { name, email, contactNumber:patientData?.contactNumber || ""},
	// 		},
	// 	},
	// 	omit: { password: true },
	// 	include: { patient: true },
	// });

	// const { patient, ...user } = createdUser;
	// const jwtPayload = {
	// 	userId: user.id,
	// 	name: user.name,
	// 	email: user.email,
	// 	role: user.role,
	// };

	// const accessToken = jwtUtils.createToken(
	// 	jwtPayload,
	// 	config.jwt_access_secret,
	// 	config.jwt_access_expires_in as SignOptions,
	// );

	// const refreshToken = jwtUtils.createToken(
	// 	jwtPayload,
	// 	config.jwt_refresh_secret,
	// 	config.jwt_refresh_expires_in as SignOptions,
	// );

	// return {
	// 	user,
	// 	patient,
	// 	accessToken,
	// 	refreshToken,
	// };



};


const verifyPatientEmailDB = async(payload:IVerifyEmailPayload)=>{
	 const email = payload.email.trim().toLowerCase();
     const otp = payload.otp
	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	
	
	if (isUserExists?.emailVerified) {
		throw new Error("Email already verified");
	}
	
	if(isUserExists?.status==="BLOCKED"){
		throw new Error("User is Blocked")
	}
   

	if(isUserExists?.isDeleted || isUserExists?.status==="DELETED"){
		throw new Error("User is deleted")
	}

  
    const otpKey = `patient-registration-otp:${email}`
	 const redisOtp = await redisClient.get(otpKey)
	  

	 if(!redisOtp){
		throw new Error("Invalid OTP")
	 }
     if(redisOtp!==otp){
        throw new Error("OTP doesnt match")
	 }
 
	  await redisClient.del(otpKey)
	
	const patientRegistrationKey = `patient-registration-data:${email}` 
	 const redisPatientData = await redisClient.get(patientRegistrationKey)

	 if(!redisPatientData){
		throw new Error("User does not exist")
	 }
	 const patientPayload:IRegisterPatientPayload = JSON.parse(redisPatientData)
     

	const createdUser = await prisma.user.create({
		data: {
			name:patientPayload.name,
			email:patientPayload.email,
			password: patientPayload.password,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: { name:patientPayload.name,
			email:patientPayload.email, contactNumber:patientPayload?.patient?.contactNumber || ""},
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

     await redisClient.del(patientRegistrationKey)
//   Sending Mail PART
	  const templatePath = path.join(process.cwd(),"src/app/templates/patient-welcome-email.ejs")
      const html = await ejs.renderFile(templatePath,{
		name: createdUser.name,
		
	  },{cache:false})

    await transporter.sendMail({
		from:config.smtp_user,
		to: email,
		subject:"Welcome to PH HealthCare ",
		// text:`Your otp is ${otp}`
		html
	})


	const { patient, ...user } = createdUser;
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user,
		patient,
		accessToken,
		refreshToken,
	};


}



const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new Error("User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User is deleted");
	}


    if(user.password===null && user.googleId!==null){
		throw new Error("User exist with Google Id , Use Google Login to continue")
	}

	const isPasswordMatched = await bcrypt.compare(password, user.password as string);

	if (!isPasswordMatched) {
		throw new Error("Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new Error("User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new Error(
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new Error("User is inactive or not found");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};



const googleLoginDB = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload | null | undefined = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("Google ID Token Verification Failed", error);
    throw new Error("Invalid Or Expired Google Id Token");
  }

  if (!googleIdTokenPayload) {
    throw new Error("Invalid Or Expired Google Id Token");
  }

  if (!googleIdTokenPayload.email) {
    throw new Error("Google Email Not Found");
  }
  if (!googleIdTokenPayload.name) {
    throw new Error("Google Email User Name Not Found");
  }

  const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = ifPatientExistWithGoogleAuth;

  if (!ifPatientExistWithGoogleAuth) {
    const ifPatientExistWithCredentials = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    if (ifPatientExistWithCredentials) {
      if (!ifPatientExistWithCredentials.emailVerified) {
        throw new Error("Email Not Verified");
      }

      if (ifPatientExistWithCredentials.status === UserStatus.BLOCKED) {
        throw new Error("User Is Blocked");
      }

      if (
        ifPatientExistWithCredentials.isDeleted ||
        ifPatientExistWithCredentials.status === UserStatus.DELETED
      ) {
        throw new Error("User Is Deleted");
      }

      user = await prisma.user.update({
        where: {
          id: ifPatientExistWithCredentials.id,
        },

        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    } else {
      // Google Register
      user = await prisma.user.create({
        data: {
          name: googleIdTokenPayload.name,
          email: googleIdTokenPayload.email,
          role: Role.PATIENT,
          googleId: googleIdTokenPayload.sub,
          authProvider: AuthProvider.GOOGLE,
          emailVerified: true,
          patient: {
            create: {
              name: googleIdTokenPayload.name,
              email: googleIdTokenPayload.email,
            },
          },
        },
      });

  const templatePath = path.join(process.cwd(),"src/app/templates/patient-welcome-email.ejs")
      const html = await ejs.renderFile(templatePath,{
		name: user.name,
		
	  },{cache:false})

    await transporter.sendMail({
		from:config.smtp_user,
		to: user.email,
		subject:"Welcome to PH HealthCare ",
		html
	})

 

    }
  }

  if (!user) {
    throw new Error("User Not Found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User Is Blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User Is Deleted");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};


const forgotPasswordDB=async(payload:IForgotPassword)=>{
    const {email} = payload;

	const isUserExist =  await prisma.user.findUnique({
		where:{
			email
		}
	});
   
	if(!isUserExist){
		throw new Error("User does not exist")
	}
 
	if(isUserExist.status==="BLOCKED"){
		throw new Error("User is Blocked")
	}
    
	if(!isUserExist.emailVerified){
		throw new Error("Verify Your Email")
	 }

	if(isUserExist.isDeleted || isUserExist.status==="DELETED"){
		throw new Error("User is deleted")
	}

     if(isUserExist.googleId || isUserExist.authProvider==="GOOGLE"){
		throw new Error("User has account with google")
	 }


     const otp  = crypto.randomInt(100000,1000000).toString() 
   
	 const key = `forgot-password-otp:${isUserExist.email}`
	  await redisClient.set(key,otp,{
		expiration:{
			type:"EX",
			value: 5 * 60
		}
	  })

	  const templatePath = path.join(process.cwd(),"src/app/templates/forgot-password.ejs")
      const html = await ejs.renderFile(templatePath,{
		name:isUserExist.name,
		otp,
		expirationMinutes:5
	  })

    await transporter.sendMail({
		from:config.smtp_user,
		to: isUserExist.email,
		subject:"Forgot Password",
		// text:`Your otp is ${otp}`
		html
	})



}


const resetPasswordDB=async(payload:IResetPassword)=>{
const {email,otp,newPassword} = payload;

	const isUserExist =  await prisma.user.findUnique({
		where:{
			email
		}
	});
   
	if(!isUserExist){
		throw new Error("User does not exist")
	}
 
	if(isUserExist.status==="BLOCKED"){
		throw new Error("User is Blocked")
	}
    
	if(!isUserExist.emailVerified){
		throw new Error("Verify Your Email")
	 }

	if(isUserExist.isDeleted || isUserExist.status==="DELETED"){
		throw new Error("User is deleted")
	}

     if(isUserExist.googleId || isUserExist.authProvider==="GOOGLE"){
		throw new Error("User has account with google")
	 }

     const key = `forgot-password-otp:${isUserExist.email}`
	 const redisOtp = await redisClient.get(key)
	  

	 if(!redisOtp){
		throw new Error("Invalid OTP")
	 }
     if(redisOtp!==otp){
        throw new Error("OTP doesnt match")
	 }

     const hashedPassword = await bcrypt.hash(newPassword,Number(config.bcrypt_salt_rounds))

	  
	 const updatedUser = await prisma.user.update({
		 where:{
			email:isUserExist.email
		 },
		 data:{
			password:hashedPassword
		 }
	 })

    //  After giving OTP we shuold delete it manually

	 await redisClient.del([key])
  const templatePath = path.join(process.cwd(),"src/app/templates/reset-password.ejs")
      const html = await ejs.renderFile(templatePath,{
		name:isUserExist.name
	  })
 await transporter.sendMail({
		from:config.smtp_user,
		to: isUserExist.email,
		subject:"Password Changed",
		html
	})

}




export const AuthService = {
	registerPatient,
	loginUser,
	getMe,
	refreshToken,
	googleLoginDB,
	forgotPasswordDB,
	resetPasswordDB,
	verifyPatientEmailDB
};
