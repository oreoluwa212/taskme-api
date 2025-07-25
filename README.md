# TaskMe API

A powerful AI-driven project management API that helps users break down complex projects into manageable tasks using Google's Gemini AI. Built with Node.js, Express, and MongoDB.

## 🚀 Features

- **AI-Powered Task Generation**: Automatically break down projects into actionable subtasks
- **Smart Project Planning**: Intelligent timeline estimation and resource allocation
- **User Authentication**: Secure JWT-based authentication system
- **Project Management**: Full CRUD operations for projects and tasks
- **Chat Interface**: Conversational AI for project planning assistance
- **Media Upload**: Cloudinary integration for file uploads
- **Real-time Insights**: Project analytics and risk assessment

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **AI Integration**: Google Generative AI (Gemini)
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Cloudinary
- **Email**: Nodemailer
- **Security**: Helmet.js, CORS

## 📋 Prerequisites

Before running this application, make sure you have:

- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- Google AI API Key (Gemini)
- Cloudinary account (for file uploads)

## 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/oreoluwa212/taskme-api.git
   cd taskme-api
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory (see `.env.example` for reference):

   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database
   MONGODB_URI=mongodb://localhost:27017/taskme-api
   # OR for MongoDB Atlas:
   # MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/taskme-api

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRATION=7d

   # Google AI (Gemini)
   GEMINI_API_KEY=your-gemini-api-key

   # Cloudinary (for file uploads)
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret

   # Email Configuration
   EMAIL_USERNAME=your-email@gmail.com
   EMAIL_PASSWORD=your-app-password
   EMAIL_FROM=TaskMe <your-email@gmail.com>
   ```

4. **Start the application**

   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL

```
http://localhost:3000/api
```

### Authentication Endpoints

#### Register User

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword"
}
```

#### Login User

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
```

### Project Endpoints

#### Create Project

```http
POST /api/projects
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "name": "Website Redesign",
  "description": "Complete redesign of company website",
  "timeline": 30,
  "priority": "High",
  "category": "Development"
}
```

#### Get All Projects

```http
GET /api/projects
Authorization: Bearer <your-jwt-token>
```

#### Get Single Project

```http
GET /api/projects/:id
Authorization: Bearer <your-jwt-token>
```

#### Update Project

```http
PUT /api/projects/:id
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "name": "Updated Project Name",
  "priority": "Medium"
}
```

#### Delete Project

```http
DELETE /api/projects/:id
Authorization: Bearer <your-jwt-token>
```

### Subtask Endpoints

#### Get Project Subtasks

```http
GET /api/subtasks/project/:projectId
Authorization: Bearer <your-jwt-token>
```

#### Update Subtask

```http
PUT /api/subtasks/:id
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "status": "completed",
  "progress": 100
}
```

### Chat Endpoints

#### Send Chat Message

```http
POST /api/chats
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "message": "Help me plan a mobile app development project"
}
```

#### Get Chat History

```http
GET /api/chats
Authorization: Bearer <your-jwt-token>
```

## 🤖 AI Service Features

The AI service powered by Google's Gemini provides:

### Intelligent Task Breakdown

- Converts project descriptions into 5-15 actionable subtasks
- Follows SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound)
- Includes realistic time estimates and dependencies

### Smart Scheduling

- Automatically schedules tasks with proper dependencies
- Ensures all dates are in the future
- Includes buffer time and risk considerations

### Project Insights

- Timeline feasibility analysis
- Complexity and risk assessment
- Resource requirement estimation
- Success metrics generation

### Chat Integration

- Natural language project planning
- Conversational task refinement
- Context-aware responses

## 📁 Project Structure

```
taskme-api/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB connection
│   ├── models/
│   │   ├── User.js             # User schema
│   │   ├── Project.js          # Project schema
│   │   ├── Message.js          # Message schema
│   │   ├── Chat.js             # Chat schema
│   │   └── Subtask.js          # Subtask schema
│   ├── routes/
│   │   ├── authRoutes.js       # Authentication routes
│   │   ├── userRoutes.js       # User management routes
│   │   ├── projectRoutes.js    # Project CRUD routes
│   │   ├── subtaskRoutes.js    # Subtask routes
│   │   └── chatRoutes.js       # AI chat routes
│   ├── middleware/
│   │   └── authMiddleware.js   # JWT authentication middleware
│   ├── services/
│   │   └── aiService.js        # AI integration service
├── server.js                   # Main server file
├── package.json
└── README.md
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: BCrypt for secure password storage
- **Helmet.js**: Security headers for Express
- **CORS Configuration**: Cross-origin resource sharing setup
- **Input Validation**: Request validation and sanitization

## 🚀 Deployment

### Render Deployment (Recommended)

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure the following settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
4. Add environment variables in Render dashboard (see .env.example)
5. Deploy automatically triggers on git push

## 📈 Performance Considerations

- **Caching**: AI service includes pattern-based caching for similar projects
- **Rate Limiting**: Built-in quota system for AI chat requests
- **Database Indexing**: Optimized MongoDB queries
- **Memory Management**: Efficient data processing for large projects

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- AI service may occasionally generate tasks with past dates (fallback mechanisms in place)
- Large projects (50+ tasks) may experience slower response times
- Chat quota resets daily (configurable in production)

## 🔮 Roadmap

- [ ] Real-time notifications
- [ ] Team collaboration features
- [ ] Advanced analytics dashboard
- [ ] Integration with external calendar apps
- [ ] Mobile app development
- [ ] Multi-language support

## 📞 Support

For support, email your-email@example.com or create an issue in the GitHub repository.

## 🙏 Acknowledgments

- Google Generative AI for powering the intelligent features
- MongoDB for reliable data storage
- Express.js community for excellent documentation
- All contributors and testers

---

**Made with ❤️ by [Oreoluwa]**
