import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import NotFound from './pages/NotFound';
import Fleet from './pages/Fleet';
import Home from './pages/Home';
import Workspace from './pages/Workspace';

const AppRoutes = () => (
  <Routes>
    <Route element={<MainLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/fleet" element={<Fleet />} />
      <Route path="/workspace" element={<Navigate to="/fleet" replace />} />
      <Route path="/workspace/:workspaceId" element={<Workspace />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>
);

export default AppRoutes;
