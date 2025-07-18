// src/routes/subtaskRoutes.js
const express = require('express');
const {
    generateSubtasks,
    getProjectSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    reorderSubtasks,
    getSubtaskStats
} = require('../controllers/subtaskController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// All routes are protected
router.use(protect);

// GET /api/subtasks/stats - Get subtask statistics
router.get('/stats', getSubtaskStats);

// POST /api/subtasks/projects/:projectId/generate - Generate AI subtasks for a project
router.post('/projects/:projectId/generate', generateSubtasks);

// GET /api/subtasks/projects/:projectId - Get all subtasks for a project
router.get('/projects/:projectId', getProjectSubtasks);

// POST /api/subtasks/projects/:projectId - Create a new subtask for a project
router.post('/projects/:projectId', createSubtask);

// PUT /api/subtasks/projects/:projectId/reorder - Reorder subtasks
router.put('/projects/:projectId/reorder', reorderSubtasks);

// PUT /api/subtasks/:subtaskId - Update a subtask
router.put('/:subtaskId', updateSubtask);

// DELETE /api/subtasks/:subtaskId - Delete a subtask
router.delete('/:subtaskId', deleteSubtask);

module.exports = router;