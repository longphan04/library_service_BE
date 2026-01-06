project/
│── package.json
│── server.js              # entry point
│── .env                   # biến môi trường
│── .gitignore
│── nodemon.json           # optional config
│── public           # optional config
│    ├── index.html
│    ├── about.html
│    ├── css/
│    │    └── style.css
│    └── js/
│         └── app.js
│
├── src/
│   ├── config/            # cấu hình (db, app, third-party)
│   │    └── db.js
│   │
│   ├── routes/            # định nghĩa routes
│   │    └── user.routes.js
│   │    └── index.js
│   │
│   ├── controllers/       # xử lý logic cho request
│   │    └── user.controller.js
│   │
│   ├── models/            # models (Mongoose, Sequelize…)
│   │    └── user.model.js
│   │
│   ├── services/          # business logic (tách khỏi controller)
│   │    └── user.service.js
│   │
│   ├── middlewares/       # middleware custom
│   │    └── auth.middleware.js
│   │
│   ├── utils/             # helper functions
│   │    └── logger.js
│   │
│   ├── validations/       # validate dữ liệu (Joi, Yup…)
│   │    └── user.validation.js
│   │
│   └── app.js             # setup express app (middlewares, routes…)
│
└── tests/                 # unit/integration tests
     └── user.test.js