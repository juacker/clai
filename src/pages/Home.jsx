import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TabView from '../components/TabView/TabView';
import styles from './Home.module.css';

const Home = () => {
  const { userInfo } = useOutletContext();

  return (
    <div className={styles.homePage}>
      <TabView />
    </div>
  );
};

export default Home;
