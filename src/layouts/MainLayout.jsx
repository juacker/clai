import React from 'react';
import { Outlet } from 'react-router-dom';
import styles from './MainLayout.module.css';

const MainLayout = () => {
  return (
    <div className={styles.mainLayout}>
      <Outlet />
    </div>
  );
};

export default MainLayout;

