/**
 * TileView Component
 *
 * Recursively renders a tile tree structure using react-resizable-panels.
 * Handles both leaf tiles (that display commands) and split tiles (that contain child tiles).
 */

import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useCommand } from '../../contexts/CommandContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import Echo from '../Echo';
import styles from './TileView.module.css';

/**
 * TileView component - recursively renders tile tree
 * @param {Object} props
 * @param {Object} props.tile - Tile object to render
 * @param {string} props.activeTileId - ID of the currently active tile
 * @returns {JSX.Element}
 */
const TileView = ({ tile, activeTileId }) => {
  const { getCommand } = useCommand();
  const { setActiveTile } = useTabManager();

  // Determine if this tile is active
  const isActive = tile.id === activeTileId;

  // Handle tile click - set as active
  const handleTileClick = () => {
    if (tile.type === 'leaf') {
      setActiveTile(tile.id);
    }
  };

  // Render split tile (contains child tiles)
  if (tile.type === 'split') {
    const isHorizontal = tile.direction === 'horizontal';

    return (
      <PanelGroup
        direction={isHorizontal ? 'horizontal' : 'vertical'}
        className={styles.panelGroup}
        data-tile-id={tile.id}
      >
        {tile.children.map((childTile, index) => {
          // Calculate default size from sizes array
          const defaultSize = tile.sizes?.[index] || 100 / tile.children.length;

          return (
            <React.Fragment key={childTile.id}>
              <Panel
                defaultSize={defaultSize}
                minSize={10}
                className={styles.panel}
              >
                <TileView tile={childTile} activeTileId={activeTileId} />
              </Panel>

              {/* Render resize handle between tiles (except after last tile) */}
              {index < tile.children.length - 1 && (
                <PanelResizeHandle
                  className={`${styles.resizeHandle} ${
                    isHorizontal ? styles.resizeHandleHorizontal : styles.resizeHandleVertical
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </PanelGroup>
    );
  }

  // Render leaf tile (contains command visualization)
  if (tile.type === 'leaf') {
    const command = tile.commandId ? getCommand(tile.commandId) : null;

    return (
      <div
        className={`${styles.tileContent} ${isActive ? styles.active : ''}`}
        data-tile-id={tile.id}
        onClick={handleTileClick}
      >
        {command ? (
          <div className={styles.commandVisualization}>
            {/* Render command based on type */}
            {command.type === 'echo' && <Echo command={command} />}

            {/* Add more command types here as they are implemented */}
            {command.type !== 'echo' && (
              <div className={styles.placeholder}>
                <p>Command type: {command.type}</p>
                <p>Not yet implemented</p>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptyTile} />
        )}
      </div>
    );
  }

  // Fallback for unknown tile types
  return (
    <div className={styles.unknownTile}>
      <p>Unknown tile type: {tile.type}</p>
    </div>
  );
};

export default TileView;

