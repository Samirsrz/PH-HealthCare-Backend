import { addDays, differenceInMinutes, startOfDay } from "date-fns"
import { prisma } from "../../lib/prisma"
import { RequestUser } from "../../middleware/checkAuth"
import { ICreateSchedulePayload } from "./schedule.interface"
import { IQuery } from "../../interfaces"
import { ScheduleWhereInput } from "../../../generated/prisma/models"



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
            doctorId:doctor.id,
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
            doctorId : doctor.id
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


const getMySchedulesDB = async(query: IQuery, user:RequestUser)=>{
    
    const doctor = await prisma.doctor.findUnique({
        where:{
            userId:user.userId
        }
    })

    if(!doctor){
        throw new Error("Doctor Profile Not Found")
    }
  
    let limit = 10;

    if(query.limit){
        limit = Number(query.limit)
    }
    let page = 1;
    if(query.page){
        page  = Number(query.page)
    }

    const skip = (page-1)*limit

     const andConditions : ScheduleWhereInput [] = [
         {
            doctorId:doctor.id
         },
         {
            isDeleted:false
         }
     ]
 
      if(query.status){
        andConditions.push({status: query.status})
      }

      const schedules= await prisma.schedule.findMany({
         where:{
            AND: andConditions
         },
         take:limit,
         skip,
         orderBy:{startDateTime:"desc"},
         include:{
             appointments:{
                include:{
                    patient:true
                }
             }
         }
      })

      const total = await prisma.schedule.count({
        where:{AND:andConditions}
      })

    return {
        data:schedules,
        meta:{
            page,
            limit,
            total,
            totalPages: Math.ceil(total/limit)
        }
    }
}



const getAllSchedulesDB = async (query: IQuery) => {
    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc";

    const andConditions: ScheduleWhereInput[] = [];

    if (query.doctorId) {
        andConditions.push({ doctorId: query.doctorId });
    }
    if (query.email) {
        andConditions.push({
            doctor: {
                email: query.email
            }
        });
    }
    if (query.status) {
        andConditions.push({ status: query.status });
    }

    const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },
        take: limit,
        skip,
        orderBy: {
            [sortBy]: sortOrder
        },
        include: {
            appointments: {
                include: {
                    patient: true
                }
            }
        }
    });

    const total = await prisma.schedule.count({
        where: { AND: andConditions }
    });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};


const getScheduleByIdDB  = async(scheduleId:string)=>{
     
    const schedule = await prisma.schedule.findUnique({
        where:{id:scheduleId},
        include:{
            doctor:{
                select:{
                    id:true,
                    name:true,
                    email:true,
                    specialization:true,
                    userId:true
                }
            },
            appointments:{
                include:{
                    patient:true
                }
            }
        }
    })

    if(!schedule || schedule.isDeleted){
        throw new Error("Schedule Not Found")
    }
     
}

export const ScheduleService={
    createScheduleDB,
    getMySchedulesDB,
    getAllSchedulesDB,
    getScheduleByIdDB
}