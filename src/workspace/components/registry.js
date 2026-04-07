import Briefing from './Briefing';
import TopicGrid from './TopicGrid';
import FileBrowser from './FileBrowser';
import WorkspaceMarkdown from './WorkspaceMarkdown';

/**
 * Component registry for workspace page composition.
 *
 * A workspace designer agent generates a workspace.json that references
 * these component names. The WorkspaceRenderer maps each name to the
 * corresponding React component and renders the composed page.
 *
 * To add a new component:
 * 1. Create the component in src/workspace/components/
 * 2. Register it here
 * 3. Document its props in the designer agent prompt
 */
export const COMPONENT_REGISTRY = {
  Briefing,
  TopicGrid,
  FileBrowser,
  Markdown: WorkspaceMarkdown,
};

/**
 * Valid layout modes for workspace.json.
 */
export const VALID_LAYOUTS = [
  'single-column',
  'two-column',
  'two-column-equal',
  'dashboard',
];
