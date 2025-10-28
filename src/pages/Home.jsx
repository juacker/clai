import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useSpaceRoom } from '../contexts/SpaceRoomContext';
import TabView from '../components/TabView/TabView';
import styles from './Home.module.css';

const Home = () => {
  const { userInfo } = useOutletContext();
  const { selectedSpace, selectedRoom, loading } = useSpaceRoom();

  return (
    <div className={styles.homePage}>
      <TabView />
    </div>
  );
};

export default Home;
