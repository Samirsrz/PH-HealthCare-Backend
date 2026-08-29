import { addDays, differenceInMinutes, startOfDay } from "date-fns"
import { prisma } from "../../lib/prisma"
import { RequestUser } from "../../middleware/checkAuth"
import { ICreateSchedulePayload } from "./schedule.interface"



const  createScheduleDB = async(payload: ICreateSchedulePayload, user:RequestUser)=>{
  
    const doctor = await prisma.doctor.findUnique({
        where:{
            userId:user.userId
        }
    })

    if(!doctor){
        throw new Error("Doctor Profile Not Found")
    }

    const startOfTheDay = startOfDay(payload.startDateTime)  //24August 12:00AM 
    const startOfNextDay = addDays(startOfTheDay,1) //25 August `12:00 AM 
    
    // ei timeline e schedule already exist kore ki na ta dekhbo
    const existingScheduleOnThisDay = await prisma.schedule.findFirst({
        where:{
            doctodId:doctor.id,
            isDeleted:false,
            startDateTime:{
                gte:startOfTheDay,
                lt: startOfNextDay
            }
        }
    })

     if(existingScheduleOnThisDay){
        throw new Error("You already have a schedule on this date")
     }

     const durationInMinutes = differenceInMinutes(
        payload.startDateTime,
        payload.endDateTime
     )
   
     const MINUTES_ALLOCATED_PER_SLOT = 20
     
     const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT)

     const schedule =  await prisma.schedule.create({
         data:{
            startDateTime:payload.startDateTime,
            endDateTime: payload.endDateTime,
            meetingLink: payload.meetingLink,
            totalSlots,
            availableSlots: totalSlots,
            doctodId : doctor.id
         },
         include:{
            doctor:{
               select:{
                name:true,
                email: true,
                contactNumber:true
              }
            }
         }
     })
      
    return schedule
}









export const ScheduleService={
    createScheduleDB
}