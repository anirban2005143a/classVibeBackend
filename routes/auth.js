const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const fetchuser = require("../middlewire/fetchUser.js");
const sendMail = require('../functions/sendMail.js')
//import models
const User = require("../model/auth.js");
const { error } = require("console");

require('dotenv').config();

const JWTserect = process.env.JWT_MESSAGE;


async function connectToMongo() {
    await mongoose.connect(`${process.env.MONGODB_URL}`);
}

function generateToken(length) {
    return randomBytes(length).toString('hex')
}

const tokens = new Map()

// route-1 : creat end point for new user with name , email and password
router.post(
    "/create",
    //express valivation check
    [
        body("firstName").isLength({ min: 3 }),
        body("lastName").isLength({ min: 3 }),
        body("password").isLength({ min: 5 }),
        body("email").isEmail(),
    ],

    async (req, res) => {
        //connect to mongodb
        await connectToMongo()
        const result = validationResult(req);
        //check is inputs good or not
        if (!result.isEmpty()) {
            return res.json({ error: true,status: 401, message: result.array() });
        }
        try {
            //check user with same email present or not
            let user = await User.findOne({ email: req.body.email });
            if (user) {
                return res.json({ error: true,status: 401, message: "email already in use" });
            }

            //make password hashing and salt
            const salt = await bcrypt.genSalt(10);
            const serectPassword = await bcrypt.hash(req.body.password, salt);
            //creat new user
            user = {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                password: serectPassword,
                email: req.body.email
            };

            const token = generateToken(32)
            tokens.set(token, { email: req.body.email, user: user, expaires: Date.now() + 24 * 60 * 60 * 1000, used: false })
            const url = `${req.body.url}?token=${token}&email=${btoa(req.body.email)}`
            const result = await sendMail(req.body.email, url)

            if (result) {
                return res.json({ error: false, message: 'One step remaining , Please verify your email...' })
            } else {
                return res.json({ error: true,status: 500, message: "Some internal error occured , Please try again" });
            }
        } catch (error) {
            console.log(error)
            return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
        }
    }
);

//route-2 : creat end point to login user with email and password
router.put(
    "/login",
    //express valivation check
    [body("password").isLength({ min: 5 }), body("email").isEmail()],
    async (req, res) => {
        await connectToMongo()
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.json({ error: result.array(), message: "Too short inputs" });
        }
        try {
            const user = await User.findOne({ email: req.body.email });//get user if exist
            if (!user) {//if user does not exist
                return res.json({ error: true,status: 401, message: "login with valid credentials" });
            }
            if (!user.isVerified) {
                return res.json({ error: true,status: 401, message: "Authentication Denied" });
            }
            const check = await bcrypt.compare(req.body.password, user.password);//check password correct or not
            if (!check) {
                return res.json({ error: true,status: 401, message: "incorrect Password" });
            }

            //creat json webtoken for sequrity
            let data = {
                id: user.id,
            };
            const jwtToken = jwt.sign(data, JWTserect);
            return res.json({ error: false, jwtToken, userId: user._id });
        } catch (error) {
            console.log(error)
            return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
        }
    }
);

//router-3 : to check authtoken and userId are same or not
router.put("/checkUser", fetchuser, async (req, res) => {
    await connectToMongo()
    try {
        if (req.id !== req.body.userId) {
            return res.json({ isMatched: false })
        }
        const user = await User.findById(req.id)
        if (!user) {
            return res.json({ error: true , status: 401, message: "User not found" })
        }
        if (!user.isVerified) {
            return res.json({ isMatched: false })
        }
        return res.json({ isMatched: true })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
    }
})

//router -4 to get user details
router.put('/get', fetchuser, async (req, res) => {
    await connectToMongo()
    try {
        //check same user or not
        if (req.id !== req.body.userId) {
            return res.json({ error: true,status: 401, message: 'Invalid Authentication' })
        }

        const user = await User.findById(req.id).select('-password')

        return res.json({ error: false, user })

    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
    }
})

//router -5 to verify user
router.put('/verify', async (req, res) => {
    const token = req.body.token;

    if (!token) {
        return res.json({ error: true, isValid: false, message: 'Token is required' });
    }
    const tokenDetail = tokens.get(token)
    //check token validation and expires
    if (!tokenDetail || tokenDetail.used || tokenDetail.expaires < Date.now()) {
        return res.json({ error: true, isValid: false, message: 'Session is expired' });
    }

    await connectToMongo()
    try {
        //check is email already verified or not
        const user = await User.findOne({ email: tokenDetail.user.email })
        if (user) {
            return res.json({ error: true, isValid: true, alreadyVerified: true, message: 'Email is already verified ... Please login' });
        }
        const notVerifieduser = tokenDetail.user
        notVerifieduser.isVerified = true
        const verifieduser = await User(notVerifieduser)
        verifieduser.save()
        //creat json webtoken for sequrity
        let data = {
            id: verifieduser.id,
        };
        const jwtToken = jwt.sign(data, JWTserect);
        tokens.set(token, { ...tokenDetail, used: true })
        return res.json({ error: false, jwtToken, userId: verifieduser._id });
    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
    }
})

//router -6 send email for change password
router.put('/change/password', async (req, res) => {
    await connectToMongo()
    try {
        const user = await User.findOne({ email: req.body.email }).select("-password")
        const token = generateToken(32)
        tokens.set(token, { email: req.body.email, user: user, expaires: Date.now() + 24 * 60 * 60 * 1000, used: false })
        const url = `${req.body.url}?token=${token}&email=${btoa(req.body.email)}`
        const result = await sendMail(req.body.email, url)
        if (result) {
            return res.json({ error: false, message: 'We have sent a email to you. Please check' })
        } else {
            return res.json({ error: true, message: "Some internal error occured , Please try again" });
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
    }
})

//router -7 to check expiry of token
router.put('/check/expairy', async (req, res) => {
    const token = req.body.token;
    try {
        if (!token) {
            return res.json({ error: true, isValid: false, message: 'Token is required' });
        }
        const tokenDetail = tokens.get(token)
        //check token validation and expires
        if (!tokenDetail || tokenDetail.used || tokenDetail.expaires < Date.now()) {
            return res.json({ error: true, isValid: false, message: 'Session is expired' });
        }
        return res.status(200).json({ error: false, isValid: true })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
    }
})

//router -8 to reset password
router.put('/reset/password', async (req, res) => {
    const token = req.body.token;

    if (!token) {
        return res.json({ error: true, isValid: false, message: 'Token is required' });
    }
    const tokenDetail = tokens.get(token)
    //check token validation and expires
    if (!tokenDetail || tokenDetail.used || tokenDetail.expaires < Date.now()) {
        return res.json({ error: true, isValid: false, message: 'Session is expired' });
    }

    await connectToMongo()
    try {
        //check is email already verified or not
        const user = await User.findOne({ email: tokenDetail.user.email })
        if (!user) {
            return res.json({ error: true, isValid: true, message: 'User not found ... please try again' });
        }
        //make password hashing and salt
        const salt = await bcrypt.genSalt(10);
        const serectPassword = await bcrypt.hash(req.body.password, salt);

        const updateUser = await User.findOneAndUpdate({ email: tokenDetail.user.email }, { password: serectPassword })
        if (!updateUser) {
            return res.status(500).json({ error: true, message: "Some error occured ... please try again" })
        }
        tokens.set(token, { ...tokenDetail, used: true })
        return res.json({ error: false, isUpdate: true, message: "Password is Updated. Please login..." })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ status: 500, error: true, message: "some error occured...Please try again" });
    }
})

module.exports = router;