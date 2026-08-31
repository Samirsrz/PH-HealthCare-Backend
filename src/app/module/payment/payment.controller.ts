import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentServices } from "./payment.service";

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const { data, meta } = await PaymentServices.getMyPaymentsDB(req.query, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payments Retrieved Successfully",
        data,
        meta,
    });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const { data, meta } = await PaymentServices.getAllPaymentsDB(req.query);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payments Retrieved Successfully",
        data,
        meta,
    });
});

const getSinglePayment = catchAsync(async (req: Request, res: Response) => {
    const paymentId = req.params.paymentId as string;
    const user = req.user!;

    const result = await PaymentServices.getSinglePaymentDB(paymentId, user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment Retrieved Successfully",
        data: result,
    });
});

export const PaymentController = {
    getMyPayments,
    getAllPayments,
    getSinglePayment,
};