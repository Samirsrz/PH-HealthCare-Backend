import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma"
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { DoctorVerificationStatus, Role, ScheduleStatus } from "../../../generated/prisma/enums";
import crypto from "crypto"
import { redisClient } from "../../lib/redis";
import path from "path"
import { transporter } from "../../lib/nodeMailer";
import ejs from "ejs"
import { IApplyAsDoctorPayload, IApproveDoctorPayload, IUpdateDoctorProfilePayload, IVerifyDoctorEmailPayload } from "./doctor.interface";
import { RequestUser } from "../../middleware/checkAuth";
import { IQuery } from "../../interfaces";
import { DoctorWhereInput } from "../../../generated/prisma/models";
import { meta } from "zod/v4/core";
import { addDays, startOfDay } from "date-fns";

const applyAsDoctorDB = async (payload: any, resume: Express.Multer.File | null, additionalFiles: Express.Multer.File[]) => {

    const isUserExist = await prisma.user.findUnique({
        where: {
            email: payload.user.email
        }
    })

    if (isUserExist) {
        throw new Error("User Already Exist with this email")
    }

    const resumeUploadResult = await new Promise<UploadApiResponse>(
        (resolve, reject) => {
            cloudinary.uploader
                .upload_stream(
                    { resource_type: "auto" },
                    (error, result) => {
                        if (error) return reject(error);
                        if (!result) return reject(new Error("No result returned from cloudinary"));
                        resolve(result);
                    },
                )
                .end(resume?.buffer);
        },
    );

    const additionalFilesUploadResults = await Promise.all(additionalFiles.map(file => {
        return new Promise<UploadApiResponse>((resolve, reject) => {
            cloudinary.uploader
                .upload_stream(
                    { resource_type: "auto" },
                    (error, result) => {
                        if (error) return reject(error);
                        if (!result) return reject(new Error("No result returned from cloudinary"));
                        resolve(result);
                    },
                )
                .end(file.buffer) // <-- fixed: was resume?.buffer
        })
    }))

    const randomDoctorPassword = Math.random().toString(36).slice(-8)
    const hashPassword = await bcrypt.hash(randomDoctorPassword, Number(config.bcrypt_salt_rounds))

    const doctorApplication = await prisma.user.create({
        data: {
            ...payload.user,
            password: hashPassword,
            role: Role.DOCTOR,
            needPasswordChange:true,
            doctor: {
                create: {
                    name: payload.user.name,
                    email: payload.user.email,
                    ...payload.doctor,
                    resume: resumeUploadResult.secure_url,
                    resumePublicId: resumeUploadResult.public_id,
                    additionalFiles: additionalFilesUploadResults.map((file) => ({
                        url: file.secure_url,
                        publicId: file.public_id
                    }))
                }
            }
        },
        include: {
            doctor: true
        }
    })
// Module 40 part---------------------
    const expirationSeconds = 60*60
    const otpKey = `doctor-application-otp:${payload.user.email}`
    const otpValue =  crypto.randomInt(100000,1000000).toString()
   
    await redisClient.set(otpKey,otpValue,{
        expiration:{
            type:"EX",
            value:expirationSeconds
        }
    })
  
   const templatePath = path.join(
    process.cwd(),"src/app/templates/registrationOTP.ejs"
   )
   const templateData = {
     name:payload.user.name,
     email:payload.user.email,
     otp:otpValue,
     expirationMinutes: expirationSeconds/60
   }

   const html = await ejs.renderFile(templatePath,templateData)

   await transporter.sendMail({
     from:config.smtp_user,
     to:payload.user.email,
     subject:"Doctor Application - Email Verification",
     html
   })
//    ---------------------------------------end
    return doctorApplication 
}


const verifyDoctorEmailDB = async (payload: IVerifyDoctorEmailPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
      role: Role.DOCTOR,
    },
  });
  if (!existingUser) {
    throw new Error("Doctor Application not found, Please apply again");
  }

  if (existingUser.emailVerified) {
    throw new Error("Email Already Verified");
  }

  const otpKey = `doctor-application-otp:${email}`;
  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new Error(
      "OTP Expired . Your Application window has closed. Please Apply Again",
    );
  }

  if (redisOtp !== otp) {
    throw new Error("OTP does not match");
  }

  await redisClient.del(otpKey);

  const verifiedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { emailVerified: true },
    omit: { password: true },
    include: { doctor: true },
  });

  return verifiedUser;
};


const approveDoctorDB = async(payload:IApproveDoctorPayload , reviewer:RequestUser)=>{
     const {doctorId, verificationStatus, rejectionReason} = payload

     const existingDoctor= await prisma.doctor.findUnique({
        where:{
           id:doctorId
        },include:{ user:true}
    })
    if(!existingDoctor){
      throw new Error("Doctor Application not found")
    }

    if(existingDoctor.isDeleted){
        throw new Error("Doctor Application has been deleted")
    }
  
    if(!existingDoctor.user.emailVerified){
        throw new Error("Doctor has not verified his Email, Application cannot be reviewed")
    }

    if(existingDoctor.verificationStatus!==DoctorVerificationStatus.PENDING){
        throw new Error(`Doctor Application Has Already Been ${existingDoctor.verificationStatus.toLocaleLowerCase()}`)
    }
     
    if(verificationStatus === DoctorVerificationStatus.REJECTED && !rejectionReason){
        throw new Error("Rejection Reason is required when rejecting a doctor application")
    }

     const updatedDoctor= await prisma.doctor.update({
        where:{ id: doctorId},
        data:{
            verificationStatus,
            rejectionReason:verificationStatus === DoctorVerificationStatus.REJECTED ? rejectionReason : null,
            reviewedBy: reviewer.userId,
            reviewedAt:new Date()
        }
     })

     const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED
     
     const templatePath= path.join(
        process.cwd(),
        `src/app/templates/${isApproved ? "doctor-application-approved.ejs" : "doctor-application-rejected.ejs"}`
     )
  
    const templateData = {
        name: updatedDoctor.name,
        reason: updatedDoctor.rejectionReason
    }

     const html =  await ejs.renderFile(templatePath,templateData)

     await transporter.sendMail({
        from: config.smtp_user,
        to: updatedDoctor.email,
        subject: isApproved? "Your Doctor Application is approved":"Your Doctor Application has been rejected",
        html
     })

   return updatedDoctor


}



const getAllDoctorsDB = async(query:IQuery)=>{


   const limit = query.limit?Number(query.limit) : 10;
   const page = query.page?Number(query.page):1;
   const skip=(page-1)*limit;
   const sortBy = query.sortBy?query.sortBy:"createdAt";
   const sortOrder = query.sortOrder ? query.sortOrder : "desc"
  
    const andConditions: DoctorWhereInput[] = []

    if(query.searchTerm){
        andConditions.push({
            OR:[
                {name:{contains:query.searchTerm, mode:"insensitive"}},
                {email:{contains:query.searchTerm,mode:"insensitive"}},
                {
                    specialization:{
                        contains:query.searchTerm,
                        mode:"insensitive"
                    }
                },
                {
                    licenseNumber:{
                        contains:query.searchTerm,
                        mode:"insensitive"
                    }
                }

            ]
        })
    }
  
   if(query.specialization) {
        andConditions.push({
           specialization:{equals:query.specialization, mode:"insensitive"}
        })
    }

    if(query.email) {
        andConditions.push({
            email : {contains:query.email, mode:"insensitive"}
        })
    }

    if(query.licenseNumber){
        andConditions.push({
            licenseNumber : {equals:query.licenseNumber, mode:"insensitive"}
        })
    }

    if(query.verificationStatus) {
        andConditions.push({
            verificationStatus: query.verificationStatus as DoctorVerificationStatus
        })
    }
 
     andConditions.push({isDeleted:false})

  const allDoctors = await prisma.doctor.findMany({
    where:{
        AND:andConditions.length>0 ? andConditions : undefined
    },
    take:limit,
    skip:skip,

    orderBy:{
        [sortBy]:sortOrder
    },
    
    include:{
        user:{
            omit:{
                password:true
            }
        },
        // Schedules: true korbo
        // appointments: true
        // prescriptions: true
    }

  })   

   const totalDoctorCount  = await prisma.doctor.count({
    where:{
        AND:andConditions
    }
   })


  return {
    data: allDoctors  ,
    meta:{
        page:page,
        limit:limit,
        total:totalDoctorCount,
        totalPages:Math.ceil(totalDoctorCount/limit)
    }
  }

}



const updateDoctorProfileDB = async(payload:IUpdateDoctorProfilePayload, user:RequestUser)=>{
 
  	const existingDoctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!existingDoctor) {
		throw new Error("Doctor Profile Not Found");
	}

	const updatedDoctor = await prisma.doctor.update({
		where: { id: existingDoctor.id },
		data: payload,
	});

	return updatedDoctor;

}


const getAvailableDoctorsByTodaysScheduleDB = async(query:IQuery)=>{
    const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const now = new Date();
	const startOfToday = startOfDay(now);
	const startOfTomorrow = addDays(startOfToday, 1);

	// A doctor is "available today" if they have at least one published,
	// not-yet-started schedule today with open slots left.

	const andConditions: DoctorWhereInput[] = [
		{ isDeleted: false },
		{ verificationStatus: DoctorVerificationStatus.APPROVED },
		{
			schedules: {
				some: {
					isDeleted: false,
					status: ScheduleStatus.PUBLISHED,
					availableSlots: { gt: 0 },
					startDateTime: {
						gte: startOfToday,
						lt: startOfTomorrow,
						gt: now,
					},
				} } },
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	const availableDoctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
			schedules: {
				where: {
					isDeleted: false,
					status: ScheduleStatus.PUBLISHED,
					availableSlots: { gt: 0 },
					startDateTime: {
						gte: startOfToday,
						lt: startOfTomorrow,
						gt: now,
					},
				},
				orderBy: { [sortBy] : sortOrder },
				select: {
					id: true,
					startDateTime: true,
					endDateTime: true,
					availableSlots: true,
					totalSlots: true,
				},
			},
		},
	});

	const totalAvailableDoctorCount = await prisma.doctor.count({
		where: { AND: andConditions },
	});

	return {
		data: availableDoctors,
		meta: {
			page,
			limit,
			total: totalAvailableDoctorCount,
			totalPages: Math.ceil(totalAvailableDoctorCount / limit),
		},
	};
}


const getAllDoctorsListPublicDB = async(query:IQuery)=>{
const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const andConditions: DoctorWhereInput[] = [
		{ isDeleted: false },
		{ verificationStatus: DoctorVerificationStatus.APPROVED },
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
				{ qualifications: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	const allDoctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
		},
	});

	const totalDoctorCount = await prisma.doctor.count({
		where: { AND: andConditions },
	});

	return {
		data: allDoctors,
		meta: {
			page,
			limit,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit),
		},
	};
}



const getSingleDoctorProfileDB = async(doctorId:string)=>{
  
	const doctor = await prisma.doctor.findUnique({
		where: {
			id: doctorId,
			isDeleted: false,
			verificationStatus: DoctorVerificationStatus.APPROVED,
		},
		select: {
			id: true,
			name: true,
			specialization: true,
			licenseNumber: true,
			qualifications: true,
			experienceYears: true,
			bio: true,
			consultationFee: true,
			createdAt: true,
		},
	});

	if (!doctor) {
		throw new Error("Doctor Not Found");
	}

	return doctor;
}





export const DoctorService = {
    applyAsDoctorDB,
    verifyDoctorEmailDB,
    approveDoctorDB,
    getAllDoctorsDB,
    updateDoctorProfileDB,
    getAvailableDoctorsByTodaysScheduleDB,
    getAllDoctorsListPublicDB,
    getSingleDoctorProfileDB,

}