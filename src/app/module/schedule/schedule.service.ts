import { addDays, differenceInMinutes, isAfter, isSameDay, startOfDay } from "date-fns"
import { prisma } from "../../lib/prisma"
import { RequestUser } from "../../middleware/checkAuth"
import { ICreateSchedulePayload, IUpdateSchedulePayload } from "./schedule.interface"
import { IQuery } from "../../interfaces"
import { ScheduleWhereInput } from "../../../generated/prisma/models"
import { ScheduleStatus } from "../../../generated/prisma/enums"



const  createScheduleDB = async(payload: ICreateSchedulePayload, user:RequestUser)=>{
  
    const doctor = await prisma.doctor.findUnique({
        where:{
            userId:user.userId
        }
    })

    if(!doctor){
        throw new Error("Doctor Profile Not Found")
    }

    if(!isSameDay(payload.startDateTime,payload.endDateTime)){
        throw new Error("Start Date Time And End Date Time must be on the same day")
    }

    if(isAfter(payload.startDateTime,payload.endDateTime)){
        throw new Error("Start Date Time Cannot Be End Date Time")
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

    return schedule
     
}



const updateScheduleDB = async(scheduleId:string,payload:IUpdateSchedulePayload,user:RequestUser)=>{
    const doctor = await prisma.doctor.findUnique({
        where:{
            userId:user.userId
        }
    })
    if(!doctor){
        throw new Error("Doctor Profile Not Found")
    }

    const schedule = await prisma.schedule.findUnique({
        where:{
            id:scheduleId
        }      
    })
    if(!schedule || schedule.isDeleted){
        throw new Error("Schedule Not Found")
    }

    if(schedule.doctorId !== doctor.id){
        throw new Error("You are not allowed to update this schedule")
    }
    if(schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots){
        throw new Error("Schedule is already published and appointment is already booked so cannot be updated")
    }
 
    payload.meetingLink = payload.meetingLink || schedule.meetingLink
    payload.startDateTime = payload.startDateTime || schedule.startDateTime
    payload.endDateTime = payload.endDateTime || schedule.endDateTime

    if(!isSameDay(payload.startDateTime,payload.endDateTime)){
        throw new Error("Start Date Time And End Date Time must be on the same day")
    }

    if(isAfter(payload.startDateTime,payload.endDateTime)){
        throw new Error("Start Date Time Cannot Be End Date Time")
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

     
     const updatedSchedule =  await prisma.schedule.update({
        where:{
            id:schedule.id
        },
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

     return updatedSchedule
       
}




const publishScheduleDB = async(scheduleId:string, user:RequestUser)=>{
    const doctor = await prisma.doctor.findUnique({
        where:{
            userId:user.userId
        }
    })
    if(!doctor){
        throw new Error("Doctor Profile Not Found")
    }

    const schedule = await prisma.schedule.findUnique({
        where:{
            id:scheduleId, doctorId : doctor.id
        }      
    })
    if(!schedule || schedule.isDeleted){
        throw new Error("Schedule Not Found")
    }

  if(schedule.status === ScheduleStatus.PUBLISHED){
        throw new Error("Schedule is already published and appointment is already booked so cannot be updated")
    }
    
    const publishedSchedule = await prisma.schedule.update({
        where:{
            id:schedule.id
        },
        data:{
            status: ScheduleStatus.PUBLISHED
        }
    })


     return publishedSchedule

}



const deleteScheduleDB = async(scheduleId:string, user:RequestUser)=>{
   const doctor = await prisma.doctor.findUnique({
        where:{
            userId:user.userId
        }
    })
    if(!doctor){
        throw new Error("Doctor Profile Not Found")
    }

    const schedule = await prisma.schedule.findUnique({
        where:{
            id:scheduleId, doctorId : doctor.id
        }      
    })
    if(!schedule || schedule.isDeleted){
        throw new Error("Schedule Not Found")
    }

    if(schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots!==schedule.availableSlots){
        throw new Error("Schedule is already published and appointment is already booked so cannot be deleted")
    }

    const deletedSchedule = await prisma.schedule.update({
        where:{id:schedule.id},
        data:{
            isDeleted:true, deletedAt: new Date()
        }
    })

  
    return deletedSchedule

}



const getTodaysSchedulesDB= async(query:IQuery) =>{
     if(!query.doctorId){
        throw new Error("Doctor Id must be provided in Query")
     }
     
      const doctor = await prisma.doctor.findUnique({
        where: {id: query.doctorId}
      })
      if(!doctor){
        throw new Error("Doctor Profile Not Found")
      }

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc";

    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfTomorrow = addDays(startOfToday,1)
 

    const andConditions: ScheduleWhereInput[] = [
        {
            doctorId : query.doctorId
        },
        {
            isDeleted:false
        },
        {
            status: ScheduleStatus.PUBLISHED
        },
        {
           startDateTime:{
            gte:startOfToday,
            lt:startOfTomorrow,
            gt:now
           }
        },
        {
            availableSlots:{gt:0}
        },


    ];
 
const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },
        take: limit,
        skip,
        orderBy: {
            [sortBy]: sortOrder
        },
     
    });
     
   const total = await prisma.schedule.count({
    where:{AND:andConditions}
   })

   return{
    data:schedules,
    meta:{
        page,limit,total,totalPages: Math.ceil(total/limit)
    }
   }


}




export const ScheduleService={
    createScheduleDB,
    getMySchedulesDB,
    getAllSchedulesDB,
    getScheduleByIdDB,
    updateScheduleDB,
    publishScheduleDB,
    deleteScheduleDB,
    getTodaysSchedulesDB
}