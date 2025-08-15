module.exports = {
    programs: [
        {
            id: "tia",
            modules: [
                {
                    id: "TIAM01",
                    lessons: [
                        { id: "TIAM01L01", durationSec: 347 },
                        { id: "TIAM01L02", durationSec: 555 },
                        { id: "TIAM01L03", durationSec: 497 },
                        { id: "TIAM01L04", durationSec: 585 },
                    ],
                    instructions: [ { id: "TIAM01I01", rewardXP: 200, estimatedTimeSec: 900, difficulty: "LOW" } ]
                },
                {
                    id: "TIAM02",
                    lessons: [ { id: "TIAM02L01", durationSec: 360 } ],
                    instructions: [ { id: "TIAM02I01", rewardXP: 220, estimatedTimeSec: 1200, difficulty: "LOW" } ]
                },
                {
                    id: "TIAM03",
                    lessons: [ { id: "TIAM03L01", durationSec: 360 } ],
                    instructions: [ { id: "TIAM03I01", rewardXP: 250, estimatedTimeSec: 1200, difficulty: "LOW" } ]
                }
            ]
        },
        {
        id: "tmd",
        modules: [
            {
                id: "TMDM01",
                lessons: [
                    { id: "TMDM01L01", durationSec: 360 },
                    { id: "TMDM01L02", durationSec: 360 },
                    { id: "TMDM01L03", durationSec: 360 },
                    { id: "TMDM01L04", durationSec: 360 },
                ],
                instructions: [ { id: "TMDM01I01", rewardXP: 200, estimatedTimeSec: 900, difficulty: "LOW" } ]
            },
            {
                id: "TMDM02",
                lessons: [{ id: "TMDM02L01", durationSec: 360 }],
                instructions: [{ id: "TMDM02I01", rewardXP: 220, estimatedTimeSec: 1200, difficulty: "LOW" }]
            },
            {
                id: "TMDM03",
                lessons: [{ id: "TMDM03L01", durationSec: 360 }],
                instructions: [{ id: "TMDM03I01", rewardXP: 250, estimatedTimeSec: 1200, difficulty: "LOW" }]
            }
        ]
        }
    ]
};