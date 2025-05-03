const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For hashing

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },
    displayName: {
      type: String,
      trim: true,
    },
    photoURL: String,
    googleId: String,
    pin: {
      type: String,
      select: false, // Hide PIN in queries by default
      minlength: [4, 'PIN must be at least 4 characters long'],
      maxlength: [8, 'PIN cannot be longer than 8 characters'],
    },
    hasPinSetup: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
    profile: {
      phoneNumber: {
        type: String,
        validate: {
          validator: function (v) {
            return /^\+?[0-9]+$/.test(v); // Optional phone number validation
          },
          message: (props) => `${props.value} is not a valid phone number!`,
        },
      },
      address: String,
      dateOfBirth: Date,
    },
    verificationCode: {
      code: {
        type: String,
      },
      expiresAt: {
        type: Date,
      },
    },
    credentials: [
      {
        credentialID: {
          type: Buffer,
          required: true,
        },
        credentialPublicKey: {
          type: Buffer,
          required: true,
        },
        counter: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    currentChallenge: {
      type: String,
      sparse: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    deviceInfo: [
      {
        deviceId: {
          type: String,
          required: true,
        },
        browser: {
          type: String,
          required: true,
        },
        os: {
          type: String,
          required: true,
        },
        lastUsed: {
          type: Date,
          default: Date.now,
          required: true,
        },
      },
    ],
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Balance cannot be negative'],
      required: true,
    },
    preferences: {
      theme: {
        type: String,
        default: 'dark',
        enum: ['dark', 'light'],
        required: true,
      },
      notifications: {
        type: Boolean,
        default: true,
        required: true,
      },
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// Hash PIN before saving
userSchema.pre('save', async function (next) {
  if (this.isModified('pin')) {
    this.pin = await bcrypt.hash(this.pin.toString(), 10);
  }
  next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
