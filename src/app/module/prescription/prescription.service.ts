import { UploadApiResponse } from "cloudinary";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth"
import { ICreatePrescriptionPayload } from "./prescription.interface"
import PDFDocument from "pdfkit"
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodeMailer";
import config from "../../config";



const createPrescriptionDB = async(payload:ICreatePrescriptionPayload, user:RequestUser)=>{
  
    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new Error( "Doctor Profile Not Found");
    }

       const appointment = await prisma.appointment.findUnique({
        where: { 
            id: payload.appointmentId,
            doctorId : doctor.id 
        },
        include: { patient: true },
    });

    if (!appointment) {
        throw new Error( "Appointment Not Found");
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
        throw new Error(
            "Prescription Can Only Be Written For A Completed Appointment",
        );
    }

     if (appointment.prescriptionUrl) {
        throw new Error(
            "A Prescription Already Exists For This Appointment",
        );
    }

  
    const pdfDocument = new PDFDocument({ margin: 50 });

    const pdfChunks: Buffer[] = []

    pdfDocument.on("data", (chunk: Buffer) => {
        pdfChunks.push(chunk)
    })

    const pdfReadyPromise = new Promise<Buffer>((resolve) => {
        pdfDocument.on("end", () => {
            resolve(Buffer.concat(pdfChunks))
        })
    })
   pdfDocument.fontSize(20).text("PH Healthcare System", { align: "center" });
    pdfDocument.fontSize(14).text("Prescription", { align: "center" });
    pdfDocument.moveDown(2);

    pdfDocument.fontSize(12).text(`Patient Name: ${appointment.patient.name}`);
    pdfDocument.text(`Doctor Name: ${doctor.name}`);
    pdfDocument.text(`Specialization: ${doctor.specialization}`);
    pdfDocument.text(`Date: ${new Date().toDateString()}`);
    pdfDocument.moveDown();

    pdfDocument.fontSize(14).text("Findings");
    pdfDocument.fontSize(12).text(payload.findings);
    pdfDocument.moveDown();

    pdfDocument.fontSize(14).text("Medicines");
    pdfDocument.moveDown(0.5);
    
    for(let i=0; i<payload.medicines.length; i++){
        const medicine = payload.medicines[i]
        pdfDocument.fontSize(12).text(`${i + 1}. ${medicine.name}`);
        pdfDocument.text(`   Dosage: ${medicine.dosage}`);
        pdfDocument.text(`   Duration: ${medicine.duration}`);
        if (medicine.instructions) {
            pdfDocument.text(`   Instructions: ${medicine.instructions}`);
        }
       pdfDocument.moveDown(0.5);
    }
    pdfDocument.end()

    const pdfBuffer = await pdfReadyPromise;

    //  now upload the pdf in cloudinary
 const uploadResult = await new Promise<UploadApiResponse>(
        (resolve, reject) => {
            cloudinary.uploader
                .upload_stream(
                    { resource_type: "raw", format: "pdf" },
                    (error, result) => {
                        if (error) {
                            return reject(error);
                        }

                        if (!result) {
                            return reject(
                                new Error(
                                    "No Result Returned From Cloudinary",
                                ),
                            );
                        }

                        resolve(result);
                    },
                )
                .end(pdfBuffer);
        },
    );

    const updatedAppointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
            prescriptionUrl: uploadResult.secure_url,
            prescriptionPublicId: uploadResult.public_id,
        },
    });

    await transporter.sendMail({
        from: config.smtp_user,
        to: appointment.patient.email,
        subject: "Your Prescription - PH Healthcare System",
        text: "Please find your prescription attached.",
        attachments: [
            {
                filename: "prescription.pdf",
                content: pdfBuffer,
            },
        ],
    });

    return updatedAppointment

}

const getSinglePrescriptionDB = async(appointmentId: string, user: RequestUser)=>{
 const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
            patient: { select: { id: true, name: true, userId: true } },
            doctor: { select: { id: true, name: true, userId: true } },
        },
    });

    if (!appointment) {
        throw new Error("Appointment Not Found");
    }

    if (user.role === Role.PATIENT) {
        if (appointment.patient.userId !== user.userId) {
            throw new Error(
                "You Are Not Allowed To View This Appointment",
            );
        }
    }
    if (user.role === Role.DOCTOR) {
        if (appointment.doctor.userId !== user.userId) {
            throw new Error(
                "You Are Not Allowed To View This Appointment",
            );
        }
    }

    if (!appointment.prescriptionUrl) {
        throw new Error(
            "No Prescription Has Been Written Yet",
        );
    }

    return {
        appointment,
        prescription : appointment.prescriptionUrl
    }
}


export const PrescriptionService = {
    createPrescriptionDB,
    getSinglePrescriptionDB
}
