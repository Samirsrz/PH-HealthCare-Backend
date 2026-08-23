import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status"
import { DoctorService } from "./doctor.service";




const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {

    const files = req.files as { [fieldname: string]: Express.Multer.File[] }

    const resume = files?.['resume'] ? files['resume'][0] : null
    const additionalFiles = files?.['additionalFiles'] || []

    const data = JSON.parse(req.body.data);

    console.log("Incoming files:", {
        resume: resume ? { originalname: resume.originalname, size: resume.size } : null,
        additionalFiles: additionalFiles.map(f => ({ originalname: f.originalname, size: f.size })),
        data
    });

    const result = await DoctorService.applyAsDoctorDB(data, resume, additionalFiles)

    console.log("Doctor application result:", result);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Applied as Doctor successfully",
        data: result
    });
});

export const DoctorController= {
    applyAsDoctor
}
