import cron from 'node-cron';
import { prisma } from './prisma';
import { DoctorVerificationStatus, Role } from '../../generated/prisma/enums';

export const deleteUnverifiedDoctors = async()=>{

cron.schedule('*/10 * * * *',async () => {
//   prisma business logic use kore doctors delete korbo

try {
       const oneHourAgo = new Date(Date.now()-60*60*1000)


  const deletedDoctors = await prisma.user.deleteMany({
     where:{
        role: Role.DOCTOR,
        emailVerified:false,
        createdAt:{lt:oneHourAgo},
        doctor:{
            verificationStatus:DoctorVerificationStatus.PENDING
        }
     }
  })
 

   if(deletedDoctors.count > 0){
      console.log(`Cron deleted ${deletedDoctors.count} who did not verify their email`);
   }


} catch (error) {
    console.log("Cron: failed to delete the unverified doctor applications",error);    
}
console.log("Unverified Doctor deleted cron schedule every 10minutes");
});
}