// src/routes/projectRoutes.js
const express = require('express');
const {
    createProject,
    getProjects,
    getProject,
    updateProject,
    deleteProject,
    getProjectStats,
    updateProjectProgress,
    searchProjects
} = require('../controllers/projectController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(protect);

// GET /api/projects/search - Advanced search with multiple criteria
router.get('/search', searchProjects);

// GET /api/projects/stats - Get project statistics
router.get('/stats', getProjectStats);

// GET /api/projects - Get all projects for authenticated user (with basic search)
router.get('/', getProjects);

// POST /api/projects - Create a new project
router.post('/', createProject);

// GET /api/projects/:id - Get a specific project
router.get('/:id', getProject);

// PUT /api/projects/:id - Update a project
router.put('/:id', updateProject);

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', deleteProject);

// PATCH /api/projects/:id/progress - Update project progress
router.patch('/:id/progress', updateProjectProgress);

module.exports = router;