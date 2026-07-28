require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const dashboardRoutes = require('./routes/dashboard');
const studentsRoutes = require('./routes/students');
const cohortsRoutes = require('./routes/cohorts');
const districtsRoutes = require('./routes/districts');
const periodsRoutes = require('./routes/periods');
const allocationsRoutes = require('./routes/allocations');
const reportsRoutes = require('./routes/reports');
const notificationsRoutes = require('./routes/notifications');
const auditLogRoutes = require('./routes/auditLog');
const usersRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    credentials: true,
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));

// Health check (used by Render)
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mchs-attachment-server' }));

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/cohorts', cohortsRoutes);
app.use('/api/districts', districtsRoutes);
app.use('/api/periods', periodsRoutes);
app.use('/api/allocations', allocationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/users', usersRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`MCHS Clinical Attachment Allocation System API running on port ${PORT}`);
});
