import React from "react";
import { Trade } from "../types/trade";
import { mockTrades } from "../data/mock-trades";
import { usePortfolio } from "../utils/PortfolioContext";
import { useGlobalFilter } from "../context/GlobalFilterContext";
import { isInGlobalFilter } from "../utils/dateFilterUtils";
import {
  calcAvgEntry,
  calcPositionSize,
  calcAllocation,
  calcSLPercent,
  calcOpenQty,
  calcExitedQty,
  calcAvgExitPrice,
  calcStockMove,
  calcRewardRisk,
  calcHoldingDays,
  calcRealisedAmount,
  calcPFImpact,
  calcRealizedPL_FIFO
} from "../utils/tradeCalculations";
import { supabase, SINGLE_USER_ID } from '../utils/supabaseClient';

// Define SortDirection type compatible with HeroUI Table
type SortDirection = "ascending" | "descending";

export interface SortDescriptor {
  column?: React.Key; // Using React.Key for column to match HeroUI
  direction?: SortDirection;
}

// Key for localStorage
const STORAGE_KEY = 'trades_data';

const loadTrades = (): Trade[] => {
  if (typeof window === 'undefined') return mockTrades;
  
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    // If localStorage is empty (user cleared data), do not return mock data
    return [];
  } catch (error) {
    console.error('Error loading trades from localStorage:', error);
    return mockTrades;
  }
};

// Utility to recalculate all calculated fields for all trades
function recalculateAllTrades(trades: Trade[], portfolioSize: number, getPortfolioSize?: (month: string, year: number) => number): Trade[] {
  // Sort trades by date (or tradeNo as fallback) for cummPf calculation
  const sorted = [...trades].sort((a, b) => {
    if (a.date && b.date) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    return (a.tradeNo || '').localeCompare(b.tradeNo || '');
  });
  let runningCummPf = 0;
  return sorted.map((trade, idx) => {
    // Original entry and pyramid entries for calculations
    const allEntries = [
      { price: Number(trade.entry || 0), qty: Number(trade.initialQty || 0) },
      { price: Number(trade.pyramid1Price || 0), qty: Number(trade.pyramid1Qty || 0) },
      { price: Number(trade.pyramid2Price || 0), qty: Number(trade.pyramid2Qty || 0) }
    ].filter(e => e.qty > 0 && e.price > 0); // Filter out entries with 0 qty or price

    const avgEntry = calcAvgEntry(allEntries);
    const totalInitialQty = allEntries.reduce((sum, e) => sum + e.qty, 0);
    const positionSize = calcPositionSize(avgEntry, totalInitialQty);
    
    // Get the portfolio size for the trade's month/year
    let tradePortfolioSize = portfolioSize;
    if (trade.date && getPortfolioSize) {
      const tradeDate = new Date(trade.date);
      const month = tradeDate.toLocaleString('default', { month: 'short' });
      const year = tradeDate.getFullYear();
      const monthlyPortfolioSize = getPortfolioSize(month, year);
      if (monthlyPortfolioSize !== undefined) {
        tradePortfolioSize = monthlyPortfolioSize;
      }
    }
    
    const allocation = calcAllocation(positionSize, tradePortfolioSize);
    const slPercent = calcSLPercent(trade.sl, trade.entry); // trade.entry is the first entry price

    // Exit legs
    const allExits = [
      { price: Number(trade.exit1Price || 0), qty: Number(trade.exit1Qty || 0) },
      { price: Number(trade.exit2Price || 0), qty: Number(trade.exit2Qty || 0) },
      { price: Number(trade.exit3Price || 0), qty: Number(trade.exit3Qty || 0) }
    ].filter(e => e.qty > 0 && e.price > 0); // Filter out exits with 0 qty or price

    const exitedQty = allExits.reduce((sum, e) => sum + e.qty, 0);
    const openQty = totalInitialQty - exitedQty;
    const avgExitPrice = calcAvgExitPrice(allExits); // Avg price of actual exits

    const stockMove = calcStockMove(
      avgEntry,
      avgExitPrice,
      trade.cmp,
      openQty,
      exitedQty,
      trade.positionStatus,
      trade.buySell
    );
    
    const rewardRisk = calcRewardRisk(
      trade.cmp || avgExitPrice || trade.entry,
      trade.entry,
      trade.sl,
      trade.positionStatus,
      avgExitPrice,
      openQty,
      exitedQty,
      trade.buySell
    );

    const pyramidDates = [];
    if (trade.pyramid1Date && trade.pyramid1Qty) pyramidDates.push({ date: trade.pyramid1Date, qty: trade.pyramid1Qty });
    if (trade.pyramid2Date && trade.pyramid2Qty) pyramidDates.push({ date: trade.pyramid2Date, qty: trade.pyramid2Qty });
    
    const exitDatesForHolding = [];
    if (trade.exit1Date && trade.exit1Qty) exitDatesForHolding.push({ date: trade.exit1Date, qty: trade.exit1Qty });
    if (trade.exit2Date && trade.exit2Qty) exitDatesForHolding.push({ date: trade.exit2Date, qty: trade.exit2Qty });
    if (trade.exit3Date && trade.exit3Qty) exitDatesForHolding.push({ date: trade.exit3Date, qty: trade.exit3Qty });
    
    let primaryExitDateForHolding: string | null = null;
    if (allExits.length > 0) {
        const validExitDates = [trade.exit1Date, trade.exit2Date, trade.exit3Date].filter(Boolean) as string[];
        if (validExitDates.length > 0) {
            primaryExitDateForHolding = validExitDates.sort((a,b) => new Date(a).getTime() - new Date(b).getTime())[0];
        }
    }
    if (trade.positionStatus !== "Open" && !primaryExitDateForHolding && allExits.length > 0) {
        primaryExitDateForHolding = trade.date;
    }

    const holdingDays = calcHoldingDays(
        trade.date, 
        primaryExitDateForHolding, 
        pyramidDates, 
        exitDatesForHolding
    );

    const realisedAmount = calcRealisedAmount(exitedQty, avgExitPrice);

    const entryLotsForFifo = allEntries.map(e => ({ price: e.price, qty: e.qty }));
    const exitLotsForFifo = allExits.map(e => ({ price: e.price, qty: e.qty }));
    
    const plRs = exitedQty > 0 ? calcRealizedPL_FIFO(entryLotsForFifo, exitLotsForFifo, trade.buySell as 'Buy' | 'Sell') : 0;
    
    const pfImpact = calcPFImpact(plRs, tradePortfolioSize);
    runningCummPf += pfImpact;
    
    const finalOpenQty = Math.max(0, openQty);

    // Destructure to omit openHeat if it exists on the trade object from localStorage
    const { openHeat, ...restOfTrade } = trade as any; // Use 'as any' for robust destructuring if openHeat might not exist

    return {
      ...restOfTrade,
      name: (restOfTrade.name || '').toUpperCase(),
      avgEntry,
      positionSize,
      allocation,
      slPercent,
      openQty: finalOpenQty,
      exitedQty,
      avgExitPrice,
      stockMove,
      holdingDays,
      realisedAmount,
      plRs,
      pfImpact,
      cummPf: runningCummPf,
    };
  });
}

// Supabase helpers
async function fetchTrades() {
  const { data, error } = await supabase
    .from('trades')
    .select('trade_data')
    .eq('id', SINGLE_USER_ID)
    .single();
  if (error) {
    if (error.code !== 'PGRST116') { // PGRST116 means no rows found
      console.error('Error fetching trades:', error);
    }
    return [];
  }
  return data?.trade_data || [];
}

async function upsertTrades(trades: any[]) {
  const { error } = await supabase
    .from('trades')
    .upsert({ id: SINGLE_USER_ID, trade_data: trades }, { onConflict: 'id' });
  if (error) {
    console.error('Supabase upsert error:', error);
    return false;
  }
  return true;
}

async function fetchTradeSettings() {
  const { data, error } = await supabase
    .from('trade_settings')
    .select('*')
    .eq('id', SINGLE_USER_ID)
    .single();
  if (error) {
    if (error.code !== 'PGRST116') { // PGRST116 means no rows found
      console.error('Error fetching trade settings:', error);
    }
    // If no settings found, create default settings
    const defaultSettings = {
      id: SINGLE_USER_ID,
      visible_columns: INITIAL_VISIBLE_COLUMNS,
      search_query: '',
      status_filter: '',
      sort_descriptor: { column: 'tradeNo', direction: 'ascending' }
    };
    await upsertTradeSettings(defaultSettings);
    return defaultSettings;
  }
  return data || {};
}

async function upsertTradeSettings(settings: any) {
  const { error } = await supabase
    .from('trade_settings')
    .upsert({ id: SINGLE_USER_ID, ...settings }, { onConflict: 'id' });
  if (error) {
    console.error('Supabase upsert error:', error);
    return false;
  }
  return true;
}

// Define INITIAL_VISIBLE_COLUMNS here, as it's closely tied to the hook's state
const INITIAL_VISIBLE_COLUMNS = [
  'tradeNo', 'date', 'name', 'setup', 'buySell', 'entry', 'sl', 'slPercent', 'cmp',
  'initialQty', 'positionSize', 'allocation', 'openQty', 'avgExitPrice', 'stockMove',
  'openHeat', 'rewardRisk', 'holdingDays', 'positionStatus', 'realisedAmount',
  'plRs', 'pfImpact', 'unrealizedPL', 'actions', 'notes'
];

export const useTrades = () => {
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [sortDescriptor, setSortDescriptor] = React.useState<SortDescriptor>({ column: 'tradeNo', direction: 'ascending' });
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(INITIAL_VISIBLE_COLUMNS);
  const { portfolioSize, getPortfolioSize } = usePortfolio();
  const { filter: globalFilter } = useGlobalFilter();

  // Load from Supabase on mount
  React.useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [loadedTrades, settings] = await Promise.all([
          fetchTrades(),
          fetchTradeSettings()
        ]);
        
        setTrades(loadedTrades);
        setSearchQuery(settings.search_query || '');
        setStatusFilter(settings.status_filter || '');
        setSortDescriptor(settings.sort_descriptor || { column: 'tradeNo', direction: 'ascending' });
        setVisibleColumns(settings.visible_columns || INITIAL_VISIBLE_COLUMNS);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Save trade settings to Supabase
  React.useEffect(() => {
    if (!isLoading) {
      const saveSettings = async () => {
        const settings = {
          search_query: searchQuery,
          status_filter: statusFilter,
          sort_descriptor: sortDescriptor,
          visible_columns: visibleColumns
        };
        await upsertTradeSettings(settings);
      };
      
      saveSettings();
    }
  }, [searchQuery, statusFilter, sortDescriptor, visibleColumns, isLoading]);

  // Load trades from localStorage on initial render
  React.useEffect(() => {
    const loadedTrades = loadTrades();
    if (loadedTrades.length > 0) {
      setTrades(recalculateAllTrades(loadedTrades, portfolioSize, getPortfolioSize));
    }
    setIsLoading(false);
  }, [portfolioSize]);

  // Save trades to localStorage whenever they change
  React.useEffect(() => {
    if (trades.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
      } catch (error) {
        console.error('Error saving trades to localStorage:', error);
      }
    }
  }, [trades]);

  // Force recalculation of trades when portfolio size changes
  React.useEffect(() => {
    setTrades(prevTrades => {
      if (prevTrades.length === 0) return prevTrades;
      return recalculateAllTrades(prevTrades, portfolioSize, getPortfolioSize);
    });
  }, [portfolioSize]);

  const addTrade = React.useCallback((trade: Trade) => {
    setTrades(prev => recalculateAllTrades([trade, ...prev], portfolioSize, getPortfolioSize));
  }, [portfolioSize]);

  const updateTrade = React.useCallback((updatedTrade: Trade) => {
    setTrades(prev => recalculateAllTrades(
      prev.map(trade => trade.id === updatedTrade.id ? updatedTrade : trade),
      portfolioSize,
      getPortfolioSize
    ));
  }, [portfolioSize]);

  const deleteTrade = React.useCallback((id: string) => {
    setTrades(prev => recalculateAllTrades(
      prev.filter(trade => trade.id !== id),
      portfolioSize,
      getPortfolioSize
    ));
  }, [portfolioSize]);

  const filteredTrades = React.useMemo(() => {
    let result = [...trades];
    
    // Apply global filter
    result = result.filter(trade => isInGlobalFilter(trade.date, globalFilter));
    
    // Apply search filter
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(trade => 
        trade.name.toLowerCase().includes(lowerQuery) ||
        trade.setup.toLowerCase().includes(lowerQuery) ||
        trade.tradeNo.toLowerCase().includes(lowerQuery)
      );
    }
    
    // Apply status filter
    if (statusFilter) {
      result = result.filter(trade => trade.positionStatus === statusFilter);
    }
    
    // Apply sorting
    if (sortDescriptor.column && sortDescriptor.direction) {
      result.sort((a, b) => {
        const aValue = a[sortDescriptor.column as keyof Trade];
        const bValue = b[sortDescriptor.column as keyof Trade];
        
        let comparison = 0;
        // Handle different data types for sorting
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          // Special handling for date strings if your date format is sortable as string
          if (sortDescriptor.column === 'date' || String(sortDescriptor.column).endsWith('Date')) {
            comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
          } else {
            comparison = aValue.localeCompare(bValue);
          }
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          comparison = (aValue === bValue) ? 0 : aValue ? -1 : 1; 
        } else {
          // Fallback for other types or mixed types (treat as strings)
          const StringA = String(aValue !== null && aValue !== undefined ? aValue : "");
          const StringB = String(bValue !== null && bValue !== undefined ? bValue : "");
          comparison = StringA.localeCompare(StringB);
        }
        
        return sortDescriptor.direction === "ascending" ? comparison : -comparison;
      });
    }
    
    return result;
  }, [trades, globalFilter, searchQuery, statusFilter, sortDescriptor]);

  return {
    trades: filteredTrades,
    addTrade,
    updateTrade,
    deleteTrade,
    isLoading,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortDescriptor,
    setSortDescriptor,
    visibleColumns,
    setVisibleColumns
  };
};
