import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status"
import { DoctorService } from "./doctor.service";
import { ApplyAsDoctorValidationZodSchema } from "./doctor.validation";




const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {

    const files = req.files as { [fieldname: string]: Express.Multer.File[] }

    const resume = files?.['resume'] ? files['resume'][0] : null
    const additionalFiles = files?.['additionalFiles'] || []

    const zodValidationResult = ApplyAsDoctorValidationZodSchema.safeParse(JSON.parse(req.body.data));

    if(!zodValidationResult.success){
        throw new Error(zodValidationResult.error.issues[0].message)
    }

    const payload = zodValidationResult.data


    // console.log("Incoming files:", {
    //     resume: resume ? { originalname: resume.originalname, size: resume.size } : null,
    //     additionalFiles: additionalFiles.map(f => ({ originalname: f.originalname, size: f.size })),
    //     data
    // });

    const result = await DoctorService.applyAsDoctorDB(payload, resume, additionalFiles)

    console.log("Doctor application result:", result);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Applied as Doctor successfully",
        data: result
    });
});





const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {

   
    const payload  = req.body
    const result = await DoctorService.verifyDoctorEmailDB(payload)

    // console.log("Doctor application result:", result);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Doctor Email verified successfully",
        data: result
    });
});




const approveDoctor = catchAsync(async (req: Request, res: Response) => {
 const payload  = req.body
    const user  = req.user!
    const result = await DoctorService.approveDoctorDB(payload,user)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Doctor Email verified successfully",
        data: result
    });
});


const getAllDoctors = catchAsync(async (req: Request, res: Response) => {

    const {data,meta} = await DoctorService.getAllDoctorsDB(req.query)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Doctors retrieved successfully",
        data:  data,
        meta: meta
    });
});


const updateDoctorProfile = catchAsync(
	async (req: Request, res: Response) => {
		const payload = req.body;
		const user = req.user!;

		const result = await DoctorService.updateDoctorProfileDB(payload, user);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Updated Successfully",
			data: result,
		});
	},
);


const getAvailableDoctorByTodaysSchedule = catchAsync(
	async (req: Request, res: Response) => {
	

		const { data, meta } = await DoctorService.getAvailableDoctorsByTodaysScheduleDB(
			req.query
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Today's Available Doctors Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getAllDoctorsListPublic = catchAsync(async (req: Request, res: Response) => {


	const { data, meta } = await DoctorService.getAllDoctorsListPublicDB(
		req.query
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data,
		meta,
	});
});

const getSingleDoctorPublicProfile = catchAsync(
	async (req: Request, res: Response) => {

		const doctorId = req.params.doctorId as string
		
		const result = await DoctorService.getSingleDoctorProfileDB(
			doctorId
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Retrieved Successfully",
			data: result,
		});
	},
);


export const DoctorController= {
    applyAsDoctor,
    verifyDoctorEmail,
    approveDoctor,
    getAllDoctors,
    updateDoctorProfile,
    getAvailableDoctorByTodaysSchedule,
	getAllDoctorsListPublic,
	getSingleDoctorPublicProfile


}
