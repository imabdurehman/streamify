import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (user) => {
  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validation - empty field, email format
  // check if user already exists - email,username
  // check for images, check for avatar
  // upload them to cloudinary, avatar
  // create user object, create entry in db
  // remove password and refresh token from response
  // check for user creation
  // return response

  const uploadedFiles = [];
  let userCreated = false;

  try {
    const { username, fullName, email, password } = req.body;

    if ([username, fullName, email, password].some((field) => !field?.trim())) {
      throw new ApiError(400, "All fields are required");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new ApiError(400, "Please enter a valid email format");
    }

    const existedUser = await User.findOne({
      $or: [
        { username: username.trim().toLowerCase() },
        { email: email.trim().toLowerCase() },
      ],
    });

    if (existedUser) {
      throw new ApiError(409, "User with email or username already exists");
    }

    if (password.length < 6) {
      throw new ApiError(400, "Password must be at least 6 characters long");
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is required");
    }

    // Upload avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar?.secure_url) {
      throw new ApiError(500, "Failed to upload avatar to cloudinary");
    }

    uploadedFiles.push({
      publicId: avatar.public_id,
      resourceType: avatar.resource_type,
    });

    // Upload cover image (optional)
    let coverImage = null;
    if (coverImageLocalPath) {
      coverImage = await uploadOnCloudinary(coverImageLocalPath);

      if (!coverImage?.secure_url) {
        throw new ApiError(500, "Failed to upload cover image to cloudinary");
      }

      uploadedFiles.push({
        publicId: coverImage.public_id,
        resourceType: coverImage.resource_type,
      });
    }

    // Create user in MongoDB
    const user = await User.create({
      username: username.trim().toLowerCase(),
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      avatar: avatar.secure_url,
      avatarPublicId: avatar.public_id,
      coverImage: coverImage?.secure_url || "",
      coverImagePublicId: coverImage?.public_id || "",
    });

    userCreated = true;

    const userResponse = {
      _id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar,
      coverImage: user.coverImage,
    };

    return res
      .status(201)
      .json(new ApiResponse(201, userResponse, "User registered successfully"));
  } catch (error) {
    if (!userCreated) {
      await Promise.allSettled(
        uploadedFiles.map((file) =>
          deleteOnCloudinary(file.publicId, file.resourceType)
        )
      );
    }

    throw error;
  }
});

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // email, password -> empty check
  // find user -> email
  // check password
  // generate tokens
  // send tokens in cookies

  const { email, password } = req.body;

  if (!email?.trim() || !password?.trim()) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user);

  const loggedInUser = {
    _id: user._id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    avatar: user.avatar,
    coverImage: user.coverImage,
  };

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, loggedInUser, "User logged in successfully"));
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: { refreshToken: 1 },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decodedToken?._id);

  if (!user) {
    throw new ApiError(401, "Invalid refresh token");
  }

  if (incomingRefreshToken !== user.refreshToken) {
    throw new ApiError(401, "Refresh token is expired or used");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user);

  // console.log("NEW ACCCESS TOKEN: ", accessToken);
  // console.log("NEW REFRESH TOKEN: ", refreshToken);

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, {}, "Tokens refreshed successfully"));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword?.trim() || !newPassword?.trim()) {
    throw new ApiError(400, "Provided fields cannot be empty");
  }

  if (newPassword.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters long");
  }

  const user = await User.findById(req.user?._id);

  const isPasswordValid = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid Password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const updateUserDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (fullName === undefined && email === undefined) {
    throw new ApiError(400, "At least one field is required");
  }

  if (
    (fullName !== undefined && !fullName?.trim()) ||
    (email !== undefined && !email?.trim())
  ) {
    throw new ApiError(400, "Provided fields cannot be empty");
  }

  const user = await User.findById(req.user?._id).select(
    "-password -refreshToken"
  );

  // update fullName
  if (fullName !== undefined) {
    user.fullName = fullName.trim();
  }

  // update email
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      throw new ApiError(400, "Please enter a valid email format");
    }

    const emailExists = await User.findOne({
      email: email.trim().toLowerCase(),
      _id: { $ne: user._id },
    });

    if (emailExists) {
      throw new ApiError(409, "User with email already exists");
    }

    user.email = email.trim().toLowerCase();
  }

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar?.secure_url) {
    throw new ApiError(500, "Failed to upload avatar to cloudinary");
  }

  let oldUser;

  try {
    oldUser = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: {
          avatar: avatar.secure_url,
          avatarPublicId: avatar.public_id,
        },
      },
      {
        new: false,
      }
    );

    if (!oldUser) {
      throw new ApiError(404, "User not found");
    }
  } catch (error) {
    // DB update failed: delete new image
    try {
      await deleteOnCloudinary(avatar.public_id, "image");
    } catch (cleanupError) {
      console.error("Failed to delete new avatar:", cleanupError);
    }
    throw error;
  }

  // DB update succeeded: delete previous image
  if (oldUser.avatarPublicId) {
    try {
      await deleteOnCloudinary(oldUser.avatarPublicId, "image");
    } catch (error) {
      console.error("Failed to delete previous avatar:", error);
    }
  }

  const user = await User.findById(req.user?._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is required");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage?.secure_url) {
    throw new ApiError(500, "Failed to upload cover image to cloudinary");
  }

  let oldUser;

  try {
    oldUser = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: {
          coverImage: coverImage.secure_url,
          coverImagePublicId: coverImage.public_id,
        },
      },
      {
        new: false,
      }
    );

    if (!oldUser) {
      throw new ApiError(404, "User not found");
    }
  } catch (error) {
    // DB update failed: delete new image
    try {
      await deleteOnCloudinary(coverImage.public_id, "image");
    } catch (cleanupError) {
      console.error("Failed to delete new cover image:", cleanupError);
    }
    throw error;
  }

  // DB update succeeded: delete previous image
  if (oldUser.coverImagePublicId) {
    try {
      await deleteOnCloudinary(oldUser.coverImagePublicId, "image");
    } catch (error) {
      console.error("Failed to delete previous cover image:", error);
    }
  }

  const user = await User.findById(req.user?._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username.trim().toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions", // The collection to join with
        localField: "_id", // Field from the current collection (User) to match
        foreignField: "channel", // Field from the 'subscriptions' collection to match
        as: "subscribers", // Alias for the joined data
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        subscribedToCount: {
          $size: "$subscribedTo",
        },
        isUserSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        coverImage: 1,
        avatar: 1,
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        subscribedToCount: 1,
        isUserSubscribed: 1,
      },
    },
  ]);

  // console.log(channel);
  if (!channel?.length) {
    throw new ApiError(404, "Channel does not exist");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",

        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",

              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  if (!user?.length) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateUserDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
