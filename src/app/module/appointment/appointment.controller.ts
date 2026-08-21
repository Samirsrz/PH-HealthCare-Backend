import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status"
import { AppointmentServices } from "./appointment.service";


const bookAppointment = catchAsync(async(req:Request,res:Response)=>{
  const result = await AppointmentServices.bookAppointmentDB()
   sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Updated Image",
		data: {
            result
		}
    })
})



const bookAppointmentCallback = catchAsync(async(req:Request,res:Response)=>{

    console.log(req.query);
  const {executedPaymentResult, redirectUrl} = await AppointmentServices.bookAppointmentCallbackDB(req.query)
 res.redirect(redirectUrl)
  
   console.log(executedPaymentResult,"callback controller");

  //    sendResponse(res, {
// 		statusCode: httpStatus.CREATED,
// 		success: true,
// 		message: "Updated Image",
// 		data:result
//     })
})


export const AppointmentController = {
    bookAppointment,
    bookAppointmentCallback
}
