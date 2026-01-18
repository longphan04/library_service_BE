import { Model, DataTypes } from "sequelize";
import sequelize from "../config/dbConnection.js";

export class AuthToken extends Model {}

AuthToken.init(
  {
    token_id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    purpose: {
      // Dùng chung 1 bảng cho nhiều loại xác thực.
      // - VERIFY_EMAIL: web click link (đang dùng)
      // - VERIFY_EMAIL_OTP: mobile app nhập OTP 6 số (mới)
      // - RESET_PASSWORD: reset password
      type: DataTypes.ENUM("VERIFY_EMAIL", "VERIFY_EMAIL_OTP", "RESET_PASSWORD"),
      allowNull: false,
      defaultValue: "RESET_PASSWORD",
    },
    token_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Đếm số lần nhập sai OTP để giới hạn brute force (chỉ apply cho purpose=VERIFY_EMAIL_OTP).
    otp_fail_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true, // DB tự default CURRENT_TIMESTAMP
    },
  },
  {
    sequelize,
    modelName: "AuthToken",
    tableName: "auth_tokens",
    timestamps: false,
  }
);

export default AuthToken;