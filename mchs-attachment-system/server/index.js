require('dotenv').config();
const path = require('path');
const fs = require('fs');
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

// contentSecurityPolicy disabled: the app is now served from this same
// Express process (client + API combined), and a default CSP would block
// the Vite build's inline styles/scripts and the Google Fonts stylesheet.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
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

// ----------------------------------------------------------------------------
// Serve the built React client (single-service deployment).
// The build step (see package.json "build" script) runs `vite build` inside
// client/ and outputs to client/dist. We serve that as static files here and
// fall back to index.html for any non-API route so React Router can handle
// client-side navigation (e.g. a hard refresh on /students/123).
// ----------------------------------------------------------------------------
const clientDistPath = path.join(__dirname, '../client/dist');
const clientBuildExists = fs.existsSync(path.join(clientDistPath, 'index.html'));

if (clientBuildExists) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[server] client/dist not found — client was not built. ' +
      'API-only mode active. Run the root "npm run build" script to build the client too.'
  );
}

// 404 handler (API routes and any unmatched path when no client build exists)
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
