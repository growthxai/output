import React, { createContext, useContext, useMemo, useRef, useState } from 'react';

export type Tab = 'workflows' | 'runs' | 'services' | 'help';

export const TAB_ORDER: Tab[] = [ 'workflows', 'runs', 'services', 'help' ];

export const TAB_LABELS: Record<Tab, string> = {
  workflows: 'Workflows',
  runs: 'Recent Runs',
  services: 'Services',
  help: 'Help'
};

export type RightPaneTab = 'input' | 'output' | 'meta';

export type RunsView = 'list' | 'detail';

export interface Selection {
  workflowName?: string;
  runId?: string;
  workflowId?: string;
  serviceName?: string;
}

export interface SearchState {
  open: boolean;
  query: string;
}

export interface RunModalState {
  open: boolean;
  workflowName: string;
  workflowPath?: string;
}

export interface ExpandedJsonState {
  open: boolean;
  value: unknown;
  title: string;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

export interface UiState {
  tab: Tab;
  search: SearchState;
  selection: Selection;
  rightPaneTab: RightPaneTab;
  runsView: RunsView;
  runModal: RunModalState;
  expandedJson: ExpandedJsonState;
  toasts: Toast[];
  setTab: ( tab: Tab ) => void;
  nextTab: () => void;
  prevTab: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  clearSearch: () => void;
  setSearchQuery: ( query: string ) => void;
  setSelection: ( selection: Selection ) => void;
  setRightPaneTab: ( tab: RightPaneTab ) => void;
  setRunsView: ( view: RunsView ) => void;
  openRunModal: ( workflowName: string, workflowPath?: string ) => void;
  closeRunModal: () => void;
  openExpandedJson: ( value: unknown, title: string ) => void;
  closeExpandedJson: () => void;
  pushToast: ( message: string, tone?: Toast['tone'] ) => void;
  dismissToast: ( id: number ) => void;
}

const UiStateContext = createContext<UiState | null>( null );

export const UiStateProvider: React.FC<{ children: React.ReactNode }> = ( { children } ) => {
  const [ tab, setTab ] = useState<Tab>( 'services' );
  const [ search, setSearch ] = useState<SearchState>( { open: false, query: '' } );
  const [ selection, setSelection ] = useState<Selection>( {} );
  const [ rightPaneTab, setRightPaneTab ] = useState<RightPaneTab>( 'output' );
  const [ runsView, setRunsView ] = useState<RunsView>( 'list' );
  const [ runModal, setRunModal ] = useState<RunModalState>( { open: false, workflowName: '' } );
  const [ expandedJson, setExpandedJson ] = useState<ExpandedJsonState>( { open: false, value: null, title: '' } );
  const [ toasts, setToasts ] = useState<Toast[]>( [] );
  const toastIdRef = useRef( 0 );

  const value = useMemo<UiState>( () => ( {
    tab,
    search,
    selection,
    rightPaneTab,
    runsView,
    runModal,
    expandedJson,
    toasts,
    setTab,
    nextTab: () => setTab( current => {
      const idx = TAB_ORDER.indexOf( current );
      return TAB_ORDER[( idx + 1 ) % TAB_ORDER.length];
    } ),
    prevTab: () => setTab( current => {
      const idx = TAB_ORDER.indexOf( current );
      return TAB_ORDER[( idx - 1 + TAB_ORDER.length ) % TAB_ORDER.length];
    } ),
    openSearch: () => setSearch( prev => ( { open: true, query: prev.query } ) ),
    closeSearch: () => setSearch( prev => ( { open: false, query: prev.query } ) ),
    clearSearch: () => setSearch( { open: false, query: '' } ),
    setSearchQuery: ( query: string ) => setSearch( prev => ( { open: prev.open, query } ) ),
    setSelection,
    setRightPaneTab,
    setRunsView,
    openRunModal: ( workflowName: string, workflowPath?: string ) => setRunModal( { open: true, workflowName, workflowPath } ),
    closeRunModal: () => setRunModal( { open: false, workflowName: '' } ),
    openExpandedJson: ( value: unknown, title: string ) => setExpandedJson( { open: true, value, title } ),
    closeExpandedJson: () => setExpandedJson( { open: false, value: null, title: '' } ),
    pushToast: ( message: string, tone: Toast['tone'] = 'info' ) => {
      const id = ++toastIdRef.current;
      setToasts( prev => [ ...prev, { id, message, tone } ] );
    },
    dismissToast: ( id: number ) => setToasts( prev => prev.filter( t => t.id !== id ) )
  } ), [ tab, search, selection, rightPaneTab, runsView, runModal, expandedJson, toasts ] );

  return <UiStateContext.Provider value={value}>{children}</UiStateContext.Provider>;
};

export const useUiState = (): UiState => {
  const ctx = useContext( UiStateContext );
  if ( !ctx ) {
    throw new Error( 'useUiState must be used inside <UiStateProvider>' );
  }
  return ctx;
};
