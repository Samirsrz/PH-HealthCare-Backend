import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status"
import { AppointmentServices } from "./appointment.service";


const bookAppointment = catchAsync(async(req:Request,res:Response)=>{

  const payload = req.body;
  const user = req.user!
  const result = await AppointmentServices.bookAppointmentDB(payload,user)
   sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Appointment Payment initiated successfully",
		data:  result
    })
})



const payAppointment = catchAsync(async(req:Request,res:Response)=>{

  const payload = req.body;
  const user = req.user!
  const result = await AppointmentServices.payAppointmentDB(payload,user)
   sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Appointment Payment initiated successfully",
		data:  result
		
    })
})



const bookAppointmentCallback = catchAsync(async(req:Request,res:Response)=>{

    console.log(req.query);
  const { redirectUrl} = await AppointmentServices.bookAppointmentCallbackDB(req.query)
 res.redirect(redirectUrl)
  
  //  console.log(executedPaymentResult,"callback controller");

  //    sendResponse(res, {
// 		statusCode: httpStatus.CREATED,
// 		success: true,
// 		message: "Updated Image",
// 		data:result
//     })
})


export const AppointmentController = {
    bookAppointment,
    bookAppointmentCallback,
    payAppointment
}
