import config from "../../config"
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointmentDB = async () => {

   const bkashIdToken = await getBkashIdToken()

   if(!bkashIdToken){
    throw new Error("no bkash access token found")
   }

  const bkashCreatePaymentResponse = await fetch(`${config.bkash_base_url}/tokenized/checkout/create`,{
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization:bkashIdToken,
        "X-App-Key":config.bkash_app_key
      },
            body:JSON.stringify({
            // agreementID:'TokenizedMerchant01L3IKB6H1565072174986',
            mode: "0011",
            payerReference: "0178888888",
            callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,  //ei URL e jabe tai amra ei URL amader moto kore banay nisi abar.. check appointment.route
            // merchantAssociationInfo: "MI05MID54RF09123456One",
            amount: "1200",
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: "Inv04444"

      })
    });
    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json()
    return bkashCreatePaymentResult
};




const bookAppointmentCallbackDB=async(query:Record<string,any>)=>{
    //  payment korar pore success ba failure ekta quiery jabe url e ...oi query gulai amra aage get korbo
    const paymentId = query.paymentID

    if(!paymentId){
        throw new Error("Payment Id missing")
    }
    const status = query.status
 
    if(!status){
        throw new Error("Payment Status is missing")
    }

    const bkashIdToken = await getBkashIdToken();   //payment korar porei to ai url hit hobe ..then wi function call hobe tai amra directly bkashIDtoken get korte parbo

    if(!bkashIdToken){
        throw new Error("no bkash access token found")
    }
    const executedPaymentResponse = await fetch(`${config.bkash_base_url}/tokenized/checkout/execute`,{
        method:"POST",
        headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization:bkashIdToken,
        "X-App-Key":config.bkash_app_key
      },
      body:JSON.stringify({
        paymentID:paymentId
      })
    })
    const executedPaymentResult = await executedPaymentResponse.json()

    if(status==="success"){
        return {
            transactionId: executedPaymentResult.trxID,
            redirectUrl:`${config.frontend_url}/dashboard/my-appointments?status=success`
        }
    }
    if(status==="failure"){
        return {
            executedPaymentResult,
            redirectUrl:`${config.frontend_url}/dashboard/my-appointments?status=failed`
        }
    }
    if(status==="cancel"){
        return {
            executedPaymentResult,
            redirectUrl:`${config.frontend_url}/dashboard/my-appointments?status=cancel`
        }
    }

    return{ 
        executedPaymentResult,
         redirectUrl:`${config.frontend_url}/dashboard/my-appointments`
    }

}
export const AppointmentServices = {
    bookAppointmentDB,
    bookAppointmentCallbackDB
}