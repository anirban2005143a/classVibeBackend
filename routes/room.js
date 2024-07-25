const express = require("express");
const router = express.Router();

const app = express();

router.put('/check', async (req, res) => {
    try { 
        if (req.owners[req.body.roomno]) {
            return res.json({ error: false, isExist: true })
        }
        return res.json({ error: true, isExist: false })
        
    } catch (error) {
        console.log(error)
        return res.status(500).send("some internal error occured");
    }

})

module.exports = router;