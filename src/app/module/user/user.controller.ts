import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import httpStatus from "http-status"
import { UserService } from "./user.service";
import { sendResponse } from "../../utils/sendResponse";


const uploadProfileImage = catchAsync(async(req:Request, res:Response)=>{
     console.log(req.file,"Request  file");
     if(!req.file){
        throw new Error("No file Found")
     }

     const userId = req.user?.userId

     const result = await UserService.uploadProfileImageDB(req.file?.buffer, userId as string)

    sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Updated Image",
		data: {
            result
		},
	});
})

export const UserController = {
    uploadProfileImage
}