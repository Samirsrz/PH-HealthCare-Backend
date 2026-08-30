import { addMinutes, isBefore, isSameDay } from "date-fns";
import { AppointmentStatus, PaymentStatus, ScheduleStatus } from "../../../generated/prisma/enums";
import config from "../../config"
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { IBookAppointmentPayload } from "./appointment.interface";
import { transporter } from "../../lib/nodeMailer";

const bookAppointmentDB = async (payload: IBookAppointmentPayload, user: RequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
      
    const patient = await prisma.patient.findUnique({
      where:{userId: user.userId}
    })
    if(!patient){
      throw new Error("Patient Profile Not Found")
    }
	const schedule = await prisma.schedule.findUnique({
			where: { id: payload.scheduleId },
			include: { doctor: true },
		});

		if (!schedule || schedule.isDeleted) {
			throw new Error("Schedule Not Found");
		}

		if (schedule.status !== ScheduleStatus.PUBLISHED) {
			throw new Error(
				"This Schedule Is Not Published Yet",
			);
		}

    const now  = new Date()
    if(!isSameDay(now,schedule.startDateTime)){
      throw new Error(
				"This Schedule Is Not Available Today",
			);
    }
 
     if(!isBefore(now,schedule.startDateTime)){
         throw new Error("This Schedule Has Already Started")
     }

      const existingAppointment = await prisma.appointment.findFirst({
        where:{
          patientId: patient.id,
          scheduleId : schedule.id,
          status:{not: AppointmentStatus.CANCELLED}
        }
      })  

	if(existingAppointment?.status === AppointmentStatus.PENDING){
			throw new Error("You Already Have A Pending Appointment. Please Pay For That")
		}
		if(existingAppointment?.status === AppointmentStatus.CONFIRMED){
			throw new Error("You Already Have A Confirmed Appointment.")
		}
		if(existingAppointment?.status === AppointmentStatus.ONGOING){
			throw new Error("You Already Have A Ongoing Appointment")
		}
		if(existingAppointment?.status === AppointmentStatus.COMPLETED){
			throw new Error("You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day")
		}

		if(schedule.availableSlots === 0){
			throw new Error("This Schedule Is Fully Booked");
		}
 
    if(!schedule.doctor.consultationFee){
      throw new Error("Doctor has not set a consultation fee yet")
    }

    const amount = schedule.doctor.consultationFee.toString()


    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
        patientId: patient.id,
        doctorId: schedule.doctor.id,
        scheduleId: schedule.id,
      },
    });

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("no bkash access token found");
    }

    const bkashCreatePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          // agreementID:'TokenizedMerchant01L3IKB6H1565072174986',
          mode: "0011",
          // payerReference: "0178888888",
          payerReference: user.email,
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`, //ei URL e jabe tai amra ei URL amader moto kore banay nisi abar.. check appointment.route
          // merchantAssociationInfo: "MI05MID54RF09123456One",
          amount: amount,
          currency: "BDT",
          intent: "sale",
          // merchantInvoiceNumber: "Inv04444"
          merchantInvoiceNumber: appointment.id,
        }),
      },
    );
    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

    //  payment model creation er kaaj korbo ekhane
    
    const payment = await tx.payment.create({
        data:{
            merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
            appointmentId:appointment.id,
            amount:amount,
            gatewayResponse:bkashCreatePaymentResult,
            bkashPaymentId: bkashCreatePaymentResult.paymentID,
            payerReference: user.email,

        }
    })

    return {
        paymentUrl:bkashCreatePaymentResult.bkashURL
    };
  });


  return transactionResult
};




const payAppointmentDB = async(payload:any, user:RequestUser)=>{
     const appointmentId = payload.appointmentId;

     const existingAppointment = await prisma.appointment.findUnique({
        where:{
            id:appointmentId
        },include:{
          schedule: {
            include:{
              doctor:true
            }
          }
        }
     })

    if(!existingAppointment){
        throw new Error("Appointment does not exist")
    }
     
    if(existingAppointment.status!=="PENDING"){
        throw new Error("Appointment is not PENDING")
    }  
  
    if(!existingAppointment.schedule.doctor.consultationFee){
      throw new Error("Doctor has not set consultation fee yet")
    }

   const amount = existingAppointment.schedule.doctor.consultationFee?.toString()  
  const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("no bkash access token found");
    }

    const bkashCreatePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          // agreementID:'TokenizedMerchant01L3IKB6H1565072174986',
          mode: "0011",
          // payerReference: "0178888888",
          payerReference: user.email,
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`, //ei URL e jabe tai amra ei URL amader moto kore banay nisi abar.. check appointment.route
          // merchantAssociationInfo: "MI05MID54RF09123456One",
          amount: amount,
          currency: "BDT",
          intent: "sale",
          // merchantInvoiceNumber: "Inv04444"
          merchantInvoiceNumber: existingAppointment.id,
        }),
      },
    );
    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();
   
    // Ager payment jodi kono taar status pending thake shetar status ta shudhu update korbo amra eidike

    await prisma.payment.update({
        where:{
            appointmentId:existingAppointment.id
        },
        data:{
            merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,  
            gatewayResponse:bkashCreatePaymentResult,
            bkashPaymentId: bkashCreatePaymentResult.paymentID,
        }        
    })
    return {
        paymentUrl: bkashCreatePaymentResult.bkashURL
    }
}



const bookAppointmentCallbackDB = async (query: Record<string, any>) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    //  payment korar pore success ba failure ekta quiery jabe url e ...oi query gulai amra aage get korbo
    const paymentId = query.paymentID;

    if (!paymentId) {
      throw new Error("Payment Id missing");
    }
    const status = query.status;

    if (!status) {
      throw new Error("Payment Status is missing");
    }

    const bkashIdToken = await getBkashIdToken(); //payment korar porei to ai url hit hobe ..then wi function call hobe tai amra directly bkashIDtoken get korte parbo

    if (!bkashIdToken) {
      throw new Error("no bkash access token found");
    }
    const executedPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: paymentId,
        }),
      },
    );
    const executedPaymentResult = await executedPaymentResponse.json();

    if (status === "success") {

      const appointment = await prisma.appointment.findUnique({
        where:{
          id: executedPaymentResult.merchantInvoiceNumber
        },
        include:{
          schedule:true,patient:true,doctor:true
        }
      })

      if(!appointment){
        throw new Error("Appointment not found")
      }

      const newAvailableSlots = appointment.schedule.availableSlots - 1 
    	// total slot = 3 , available slot = 2
			// (total - available) + 1

			const alreadyBookedSlots = appointment.schedule.totalSlots - appointment.schedule.availableSlots;

			const serialNumber = alreadyBookedSlots + 1

      	// 25 August => 3:00 PM - 4:00 PM
			// 1st person joining time => startDateTime = 2026-08-25T15:00:00.436Z => 3:00 PM
			// serial number (1) - 1 * 20 => 0 minues

			// 2nd person joining time => startDateTime = 2026-08-25T15:20:00.436Z => 3:00 PM
			// serial number (2) - 1 * 20 => 20 minutes


			// 3nd person joining time => startDateTime = 2026-08-25T15:40:00.436Z => 3:00 PM
			// serial number (3) - 1 * 20 => 40 mintes

			const joiningTime = addMinutes(
				appointment.schedule.startDateTime, 
				(serialNumber - 1) * 20
			)

      await tx.appointment.update({
        where: {
          id: executedPaymentResult.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
          joiningTime,
          serialNumber
        },
      });
      await prisma.schedule.update({
        where:{
          id: appointment.schedule.id
        },data:{
          availableSlots: newAvailableSlots
        }
      })
      await tx.payment.update({
        where: {
        //   appointmentId: executedPaymentResult.merchantInvoiceNumber,
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.PAID,
          bkashTrxId: executedPaymentResult.trxID,
          paidAt: executedPaymentResult.paymentExecuteTime,
          gatewayResponse: executedPaymentResult,
        },
      });
 
      await transporter.sendMail({
        from:config.smtp_user,
        to:appointment.patient.email,
        subject:"Your application Invoice - PH healthcare system",
        text: "Thank you for booking an appointment. Please find your invoice attached.",
				// attachments : [
				// 	{
				// 		filename: "invoice.pdf",
				// 		content : pdfBuffer
				// 	}
				// ]
      })

      return {
        transactionId: executedPaymentResult.trxID,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
      };
    } else if (status === "failure") {
          await tx.payment.update({
        where: {
        //   appointmentId: executedPaymentResult.merchantInvoiceNumber,
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponse: executedPaymentResult,
        },
      });
      return {
       
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
      };
    } else if (status === "cancel") {
        await tx.payment.update({
        where: {
        //   appointmentId: executedPaymentResult.merchantInvoiceNumber,
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.CANCELLED,
          gatewayResponse: executedPaymentResult,
        },
      });
      return {
        executedPaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
      };
    } else {
      return {
        executedPaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
      };
    }
  });

  return transactionResult
};



const cancelAppointmentDB = async(payload:any)=>{
    
  const transactionResult = await prisma.$transaction(async(tx)=>{
       const appointmentId = payload.appointmentId

    const existingAppointment = await tx.appointment.findUnique({
        where:{
            id:appointmentId
        },
        include:{
          payment:true
        }
     })

    if(!existingAppointment){
        throw new Error("Appointment does not exist")
    }

    if(existingAppointment.status==="ONGOING" || existingAppointment.status==="COMPLETED"){
      throw new Error("Appointment Ongoing or Completed")
    }

    if(existingAppointment.status==="CANCELLED"){
      throw new Error("Appointment Already Cancelled")
    }

    const updatedAppointment = await tx.appointment.update({
      where:{
        id:existingAppointment.id
      },
      data:{
        status:"CANCELLED"
      }
    })

  const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("no bkash access token found");
    }

    // const bkashSignature = crypto

   const bkashRefundPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
        paymentID:existingAppointment.payment?.bkashPaymentId,
        trxID: existingAppointment.payment?.bkashTrxId,
        amount: existingAppointment.payment?.amount.toString(),
        sku: "Appointment Cancellation",
        reason: "Patient cancelled the appointment"
        }),
      },
    );

   const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();
          

  //  bkash theke refund er pore akhon DB te update korbo
     const updatePayment = await tx.payment.update({
      where:{
            appointmentId:existingAppointment.id
      },
      data:{
        refundTrxId: bkashRefundPaymentResult.refundTrxID,
        refundedAt: bkashRefundPaymentResult.completedTime,
        refundAmount: bkashRefundPaymentResult.amount,
        refundReason:"Patient cancelled the appointment",
        status:PaymentStatus.REFUNDED,
        gatewayResponse: bkashRefundPaymentResult
      }
     })

      return{
        appointment: updatedAppointment,
        payment: updatePayment
      }

  })
  
  return transactionResult
}


export const AppointmentServices = {
    bookAppointmentDB,
    bookAppointmentCallbackDB,
    payAppointmentDB,
    cancelAppointmentDB
}                                                                                                                           

