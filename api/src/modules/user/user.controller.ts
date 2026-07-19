import catchAsync from "@/lib/catchAsync";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { userService } from "./user.service";

// get single user
const getSingleUserController = catchAsync(
  async (req: Request, res: Response) => {
    const user = await userService.getSingleUserService(
      req.params.id as string,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: user,
      message: "user get successfully",
    });
  },
);

// update user email
const updateUserEmailController = catchAsync(
  async (req: Request, res: Response) => {
    const email = req.body.email;
    const updateEmail = await userService.updateUserEmailService(
      email,
      req.params.id as string,
    );
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
      result: updateEmail,
    });
  },
);

// update user country
const updateUserCountryController = catchAsync(
  async (req: Request, res: Response) => {
    const country = req.body.country;
    const updateCountry = await userService.updateUserCountryService(
      req.params.id as string,
      country,
    );
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
      result: updateCountry,
    });
  },
);

// delete user
const deleteUserController = catchAsync(async (req: Request, res: Response) => {
  const reason = req.body.reason;

  const deleteUser = await userService.deleteUserService(reason, req);

  sendResponse(res, {
    success: true,
    message: "data deleted successfully",
    result: deleteUser,
  });
});

// set password
const setPasswordController = catchAsync(
  async (req: Request, res: Response) => {
    const result = await userService.setPasswordService(req);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
      result,
    });
  },
);

// check limits
const checkLimitsController = catchAsync(
  async (req: Request, res: Response) => {
    const result = await userService.checkLimitsService(req.user?.user_id!);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Limits checked successfully",
      result,
    });
  },
);

export const userController = {
  getSingleUserController,
  setPasswordController,
  updateUserCountryController,
  updateUserEmailController,
  deleteUserController,
  checkLimitsController,
};
