import { DoctorVerificationStatus } from "../../../generated/prisma/enums";

export interface IApplyAsDoctorPayload {
    user:{
        name:string,
        email:string
    };
    doctor:{
        address?:string;
        specialization:string;
        licenseNumber: string;
        qualifications: string;
        experiencedYears: number;
        bio?:string;
        consultationFee?:number;
        contactNumber?:string;
    }
}


export interface IApproveDoctorPayload{
    doctorId:string;
    verificationStatus: DoctorVerificationStatus;
    rejectionReason?:string;
}
 


export interface IVerifyDoctorEmailPayload{
      email:string,
      otp:string
}

export interface IUpdateDoctorProfilePayload{
    address ?:string;
    bio ?: string;
    consultationFee?: number;
    contactNumber?: string
}