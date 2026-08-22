import { AppointmentStatus, PaymentStatus } from "../../../generated/prisma/enums";
import config from "../../config"
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";

const bookAppointmentDB = async (payload: any, user: RequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    
    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
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
          amount: "1200",
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
            amount:1200,
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
        }
     })

    if(!existingAppointment){
        throw new Error("Appointment does not exist")
    }
     
    if(existingAppointment.status!=="PENDING"){
        throw new Error("Appointment is not PENDING")
    }  

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
          amount: "1200",
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
      await tx.appointment.update({
        where: {
          id: executedPaymentResult.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
        },
      });
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



const cancelAppointmentDB = async(payload:any,user:RequestUser)=>{
   
    const appointmentId = payload.appointmentId
    const existingAppointment = await prisma.appointment.findUnique({
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

    const updatedAppointment = await prisma.appointment.update({
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

   const bkashRefundPaymentResponse = await fetch(
      `${config.bkash_base_url}/v2/tokenized-checkout/refund/payment/transaction`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
        paymentId:existingAppointment.payment?.bkashPaymentId,
        trxId: "BFD90JRLST",
        refundAmount: "1",
        sku:"test",
        reason: "test"
        }),
      },
    );

   const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();
                        

}


export const AppointmentServices = {
    bookAppointmentDB,
    bookAppointmentCallbackDB,
    payAppointmentDB
}                                                                                                                           

