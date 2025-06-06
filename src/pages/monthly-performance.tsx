import React from "react";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Tooltip, Input, Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useTrades } from "../hooks/use-trades";
import { usePortfolio } from "../utils/PortfolioContext";
import { useCapitalChanges } from "../hooks/use-capital-changes";
import { calcXIRR } from "../utils/tradeCalculations";

interface MonthlyData {
  month: string;
  addedWithdrawn: number;
  startingCapital: number;
  pl: number;
  plPercentage: number;
  finalCapital: number;
  yearPlPercentage: string;
  trades: number;
  winPercentage: number;
  avgGain: number;
  avgLoss: number;
  avgRR: number;
  biggestImpact: number;
  smallestLoss: number;
  avgHoldingDays: number;
  cagr: number;
  rollingReturn1M: number;
  rollingReturn3M: number;
  rollingReturn6M: number;
  rollingReturn12M: number;
}

export const MonthlyPerformanceTable: React.FC = () => {
  const { trades } = useTrades();
  const { getPortfolioSize, setPortfolioSize, getLatestPortfolioSize, monthlyPortfolioSizes } = usePortfolio();
  
  // Debug: Log trades data
  React.useEffect(() => {
    console.log('Total trades loaded:', trades.length);
    console.log('Trades sample:', trades.slice(0, 3)); // First 3 trades
  }, safeDeps([trades]));
  const { monthlyCapital, capitalChanges, addCapitalChange, updateCapitalChange, setMonthlyStartingCapital, deleteCapitalChange } = useCapitalChanges(trades, getLatestPortfolioSize());
  const [yearlyStartingCapital, setYearlyStartingCapital] = React.useState(getLatestPortfolioSize());

  // Inline editing state
  const [editingCell, setEditingCell] = React.useState<{ row: number; col: string } | null>(null);
  const [editingValue, setEditingValue] = React.useState<string>("");

  // Add global year picker state
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState<number>(currentYear);

  // Build monthly data from trades with proper date handling
  const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlyMap: Record<string, { trades: typeof trades; date: Date }> = {};
  
  // Filter trades by selected year first
  const filteredTrades = trades.filter(trade => {
    if (!trade.date) return false;
    const tradeYear = new Date(trade.date).getFullYear();
    return tradeYear === selectedYear;
  });

  // Then group by month
  filteredTrades.forEach(trade => {
    const d = new Date(trade.date);
    const month = d.toLocaleString('default', { month: 'short' });
    if (!monthlyMap[month]) {
      monthlyMap[month] = { trades: [], date: d };
    }
    monthlyMap[month].trades.push(trade);
  });

  // Sort trades by date within each month
  Object.values(monthlyMap).forEach(monthData => {
    monthData.trades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  // Filter or map all table logic to use selectedYear
  const filteredMonthlyCapital = monthlyCapital.filter(mc => mc.year === selectedYear);

  // Build monthly data for the selected year
  const initialMonthlyData = monthOrder.map((month, i) => {
    const monthData = monthlyMap[month] || { trades: [], date: new Date() };
    const monthTrades = monthData.trades;
    const tradesCount = monthTrades.length;
    const winTrades = monthTrades.filter(t => t.plRs > 0);
    const lossTrades = monthTrades.filter(t => t.plRs < 0);
    const winPercentage = tradesCount > 0 ? (winTrades.length / tradesCount) * 100 : 0;
    const avgGain = winTrades.length > 0 ? winTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / winTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / lossTrades.length : 0;
    const avgRR = tradesCount > 0 ? monthTrades.reduce((sum, t) => sum + (t.rewardRisk || 0), 0) / tradesCount : 0;
    const avgHoldingDays = tradesCount > 0 ? monthTrades.reduce((sum, t) => sum + (t.holdingDays || 0), 0) / tradesCount : 0;

    // Find corresponding monthly capital data
    const monthCapital = filteredMonthlyCapital.find(mc => mc.month === month) || {
      month,
      year: selectedYear,
      startingCapital: 0,
      deposits: 0,
      withdrawals: 0,
      pl: 0,
      finalCapital: 0
    };

    // Get capital changes for this month and year
    const monthCapitalChanges = capitalChanges.filter(change => {
      const changeDate = new Date(change.date);
      return changeDate.getMonth() === monthOrder.indexOf(month) && 
             changeDate.getFullYear() === selectedYear;
    });

    // Calculate net added/withdrawn from capital changes
    let netAddedWithdrawn = 0;
    monthCapitalChanges.forEach(change => {
      netAddedWithdrawn += change.type === 'deposit' ? change.amount : -change.amount;
    });

    // If no capital changes, fall back to the monthly capital data
    if (monthCapitalChanges.length === 0) {
      netAddedWithdrawn = monthCapital.deposits - monthCapital.withdrawals;
    }

    // For months with no trades, show '-' for most stats and set finalCapital to 0
    // Use the starting capital from monthlyCapital which includes the net deposits/withdrawals
    const adjustedStartingCapital = monthCapital.startingCapital || getPortfolioSize(month, selectedYear);
    
    return {
      month,
      addedWithdrawn: netAddedWithdrawn,
      startingCapital: adjustedStartingCapital,
      pl: tradesCount > 0 ? monthCapital.pl : '-',
      plPercentage: tradesCount > 0 ? 0 : '-',
      finalCapital: tradesCount > 0 ? monthCapital.finalCapital : 0,
      yearPlPercentage: '',
      trades: tradesCount > 0 ? tradesCount : '-',
      winPercentage: tradesCount > 0 ? winPercentage : '-',
      avgGain: tradesCount > 0 ? avgGain : '-',
      avgLoss: tradesCount > 0 ? avgLoss : '-',
      avgRR: tradesCount > 0 ? avgRR : '-',
      biggestImpact: 0,
      smallestLoss: 0,
      avgHoldingDays: tradesCount > 0 ? avgHoldingDays : '-',
      cagr: 0,
      rollingReturn1M: 0,
      rollingReturn3M: 0,
      rollingReturn6M: 0,
      rollingReturn12M: 0
    };
  });

  // Effect to update yearly starting capital when portfolio size changes
  React.useEffect(() => {
    setYearlyStartingCapital(getLatestPortfolioSize());
  }, safeDeps([getLatestPortfolioSize]));

  const computedData = React.useMemo(() => {
    const currentYear = selectedYear; // Use the selected year instead of current year
    
    return initialMonthlyData.map((row, i) => {
      const startingCapital = row.startingCapital;
      const pl = row.pl;
      const finalCapital = row.finalCapital;
      const monthIndex = monthOrder.indexOf(row.month);
      const currentDate = new Date(currentYear, monthIndex, 1);
      
      // Get all capital changes up to this month
      const relevantChanges = capitalChanges
        .filter(change => new Date(change.date) <= currentDate)
        .map(change => ({
          date: new Date(change.date),
          amount: change.type === 'deposit' ? change.amount : -change.amount
        }));

      // Calculate XIRR for different time periods
      const startOfYear = new Date(currentYear, 0, 1);
      const xirrYTD = (typeof startingCapital === 'number' && typeof finalCapital === 'number' && startingCapital !== 0)
        ? calcXIRR(startOfYear, yearlyStartingCapital, currentDate, finalCapital, relevantChanges)
        : 0;

      // Calculate rolling returns only if we have the required previous months' data
      let xirr1M = 0;
      let xirr3M = 0;
      let xirr6M = 0;
      let xirr12M = 0;

      // 1-month return
      if (i > 0 && initialMonthlyData[i-1] && typeof initialMonthlyData[i-1].finalCapital === 'number' && typeof finalCapital === 'number') {
        const prevMonth = new Date(currentYear, monthIndex - 1, 1);
        xirr1M = calcXIRR(
          prevMonth,
          initialMonthlyData[i-1].finalCapital,
          currentDate,
          finalCapital,
          relevantChanges.filter(c => c.date >= prevMonth)
        );
      }

      // 3-month return
      if (i >= 2 && initialMonthlyData[i-3] && typeof initialMonthlyData[i-3].finalCapital === 'number' && typeof finalCapital === 'number') {
        const prev3Month = new Date(currentYear, monthIndex - 3, 1);
        xirr3M = calcXIRR(
          prev3Month,
          initialMonthlyData[i-3].finalCapital,
          currentDate,
          finalCapital,
          relevantChanges.filter(c => c.date >= prev3Month)
        );
      }

      // 6-month return
      if (i >= 5 && initialMonthlyData[i-6] && typeof initialMonthlyData[i-6].finalCapital === 'number' && typeof finalCapital === 'number') {
        const prev6Month = new Date(currentYear, monthIndex - 6, 1);
        xirr6M = calcXIRR(
          prev6Month,
          initialMonthlyData[i-6].finalCapital,
          currentDate,
          finalCapital,
          relevantChanges.filter(c => c.date >= prev6Month)
        );
      }

      // 12-month return
      if (i >= 11 && initialMonthlyData[i-12] && typeof initialMonthlyData[i-12].finalCapital === 'number' && typeof finalCapital === 'number') {
        const prev12Month = new Date(currentYear, monthIndex - 12, 1);
        xirr12M = calcXIRR(
          prev12Month,
          initialMonthlyData[i-12].finalCapital,
          currentDate,
          finalCapital,
          relevantChanges.filter(c => c.date >= prev12Month)
        );
      }

      return {
        ...row,
        plPercentage: (typeof startingCapital === 'number' && typeof pl === 'number' && startingCapital !== 0)
          ? (pl / startingCapital) * 100
          : '-',
        cagr: xirrYTD,
        rollingReturn1M: xirr1M,
        rollingReturn3M: xirr3M,
        rollingReturn6M: xirr6M,
        rollingReturn12M: xirr12M
      };
    });
  }, safeDeps([initialMonthlyData, yearlyStartingCapital, capitalChanges, monthOrder]));
  
  // Ensure we have valid data before rendering the table
  if (!computedData || computedData.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p>No data available</p>
      </div>
    );
  }

  // Helper to get the date string for the first day of a month/year
  const getMonthDateString = (month: string, year: number) => {
    const monthIndex = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month);
    return new Date(year, monthIndex, 1).toISOString();
  };

  // Helper to get all years from 2000 to current year+1
  const getYearOptions = () => {
    const years = [];
    for (let y = 2000; y <= currentYear + 1; y++) {
      years.push(y);
    }
    return years;
  };

  // Handler for saving the edited value
  const handleSaveAddedWithdrawn = (rowIndex: number, month: string, year: number) => {
    const value = Number(editingValue);
    if (isNaN(value)) return;
    
    // Get the month index (0-11)
    const monthIndex = monthOrder.indexOf(month);
    if (monthIndex === -1) return;
    
    // Always use selectedYear for the year
    year = selectedYear;
    
    // Check if starting capital is set for this month (either manually or automatically)
    const monthData = computedData[rowIndex];
    const startingCapital = monthData.startingCapital;
    
    // If starting capital is 0 or not set, show the error
    if (typeof startingCapital !== 'number' || startingCapital <= 0) {
      alert('Please set the Starting Capital before adding/withdrawing funds.\n\nClick on the Starting Capital field first to set it.');
      // Move focus to the starting capital cell
      const startingCapitalColIndex = columns.findIndex(col => col.key === 'startingCapital');
      if (startingCapitalColIndex !== -1) {
        setEditingCell({ row: rowIndex, col: 'startingCapital' });
        setEditingValue('');
      } else {
        setEditingCell(null);
        setEditingValue('');
      }
      return;
    }
    
    const monthDate = new Date(year, monthIndex, 1);
    const formattedDate = monthDate.toISOString();
    
    // Find any capital change for this month (assume only one per month for this UI)
    const existingChange = capitalChanges.find(change => {
      const d = new Date(change.date);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    });

    // Get the current portfolio size for this month
    const currentPortfolioSize = getPortfolioSize(month, year);
    
    if (existingChange) {
      // Calculate the difference to adjust the portfolio size
      const oldAmount = existingChange.type === 'deposit' 
        ? existingChange.amount 
        : -existingChange.amount;
      const newAmount = value; // value can be positive or negative
      const difference = newAmount - oldAmount;
      
      // Update the portfolio size by the difference
      const newPortfolioSize = currentPortfolioSize + difference;
      setPortfolioSize(newPortfolioSize, month, year);
      
      // Update the capital change
      updateCapitalChange({
        ...existingChange,
        amount: Math.abs(value),
        type: value >= 0 ? 'deposit' : 'withdrawal',
        date: formattedDate,
        description: 'Manual edit from performance table'
      });
    } else if (value !== 0) {
      // Only add if value is not zero
      // Update the portfolio size by the new amount
      const newPortfolioSize = currentPortfolioSize + value;
      setPortfolioSize(newPortfolioSize, month, year);
      
      // Add new capital change
      addCapitalChange({
        amount: Math.abs(value),
        type: value >= 0 ? 'deposit' : 'withdrawal',
        date: formattedDate,
        description: 'Manual edit from performance table'
      });
    } else if (value === 0 && existingChange) {
      // If setting to zero and there's an existing change, remove it
      // and adjust the portfolio size back
      const oldAmount = existingChange.type === 'deposit' 
        ? existingChange.amount 
        : -existingChange.amount;
      const newPortfolioSize = currentPortfolioSize - oldAmount;
      setPortfolioSize(newPortfolioSize, month, year);
      
      // Delete the existing change
      deleteCapitalChange(existingChange.id);
    }
    
    setEditingCell(null);
    setEditingValue("");
  };

  const columns = [
    {
      key: 'month',
      label: (
        <div className="flex items-center gap-1">
          Month
        </div>
      )
    },
    {
      key: 'startingCapital',
      label: (
        <div className="flex items-center gap-1">
          Starting Capital
          <Tooltip content={
        <div className="max-w-xs text-xs p-1">
          <div>Capital at the start of the month, before trades and capital changes.</div>
          <div className="mt-2 font-semibold">Formula:</div>
          <div>Previous Month's Final Capital + Net Capital Changes</div>
          <div className="text-foreground-400 mt-1">Where:</div>
          <div>• Previous Month's Final Capital = Starting Capital + P/L + (Added - Withdrawn)</div>
          <div>• Net Capital Changes = Sum of all deposits - Sum of all withdrawals</div>
        </div>
      } placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'addedWithdrawn',
      label: (
        <div className="flex items-center gap-1">
          Added/Withdrawn
          <Tooltip
            content={
              <div className="max-w-xs text-xs p-1">
                <b>Assumption:</b><br />
                For XIRR calculation, all additions and withdrawals are assumed to occur on the <b>first day of the month</b>, even if the actual cash flow happened mid-month.<br /><br />
                This may slightly affect the accuracy of annualized returns if you have frequent mid-month capital changes.
              </div>
            }
            placement="top"
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'pl',
      label: (
        <div className="flex items-center gap-1">
          P/L
          <Tooltip content="Total profit or loss from all trades closed in this month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'plPercentage',
      label: (
        <div className="flex items-center gap-1">
          % P/L
          <Tooltip content="Profit or loss as a percentage of starting capital for the month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'finalCapital',
      label: (
        <div className="flex items-center gap-1">
          Final Capital
          <Tooltip 
            content={
              <div className="max-w-xs p-2">
                <p className="font-semibold mb-1">Final Capital Calculation:</p>
                <p className="text-sm">Starting Capital + P/L + (Added - Withdrawn)</p>
                <p className="text-xs mt-2 text-foreground-500">Note: Please ensure Starting Capital is set before adding/withdrawing funds.</p>
              </div>
            } 
            placement="top"
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'cagr',
      label: (
        <div className="flex items-center gap-1">
          YTD Return %
          <Tooltip
            content={
              <div className="max-w-xs text-xs p-1">
                <b>Year-to-Date Return</b> calculated using XIRR (Extended Internal Rate of Return)<br /><br />
                <ul className="list-disc pl-4">
                  <li>Accounts for the timing and size of all cash flows</li>
                  <li>Includes deposits and withdrawals</li>
                  <li>More accurate than simple percentage returns</li>
                  <li>Annualized return from start of year to current month</li>
                </ul>
                <br />
                <span className="text-foreground-400">Uses XIRR calculation which considers the timing of all cash flows</span>
              </div>
            }
            placement="top"
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'rollingReturn1M',
      label: (
        <div className="flex items-center gap-1">
          1M Return %
          <Tooltip
            content={
              <div className="max-w-xs text-xs p-1">
                <b>1-Month Return</b> calculated using XIRR<br /><br />
                <ul className="list-disc pl-4">
                  <li>Considers all cash flows in the last month</li>
                  <li>Accounts for timing of deposits/withdrawals</li>
                  <li>More accurate than simple month-over-month return</li>
                </ul>
              </div>
            }
            placement="top"
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'rollingReturn3M',
      label: (
        <div className="flex items-center gap-1">
          3M Return %
          <Tooltip
            content={
              <div className="max-w-xs text-xs p-1">
                <b>3-Month Return</b> calculated using XIRR<br /><br />
                <ul className="list-disc pl-4">
                  <li>Considers all cash flows in the last 3 months</li>
                  <li>Accounts for timing of deposits/withdrawals</li>
                  <li>Annualized return over the 3-month period</li>
                </ul>
              </div>
            }
            placement="top"
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'rollingReturn6M',
      label: (
        <div className="flex items-center gap-1">
          6M Return %
          <Tooltip
            content={
              <div className="max-w-xs text-xs p-1">
                <b>6-Month Return</b> calculated using XIRR<br /><br />
                <ul className="list-disc pl-4">
                  <li>Considers all cash flows in the last 6 months</li>
                  <li>Accounts for timing of deposits/withdrawals</li>
                  <li>Annualized return over the 6-month period</li>
                </ul>
              </div>
            }
            placement="top"
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'rollingReturn12M',
      label: (
        <div className="flex items-center gap-1">
          12M Return %
          <Tooltip
            content={
              <div className="max-w-xs text-xs p-1">
                <b>12-Month Return</b> calculated using XIRR<br /><br />
                <ul className="list-disc pl-4">
                  <li>Considers all cash flows in the last 12 months</li>
                  <li>Accounts for timing of deposits/withdrawals</li>
                  <li>True annual return considering all capital changes</li>
                </ul>
              </div>
            }
            placement="top"
          >
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'trades',
      label: (
        <div className="flex items-center gap-1">
          Trades
          <Tooltip content="Number of trades closed in this month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'winPercentage',
      label: (
        <div className="flex items-center gap-1">
          % Win
          <Tooltip content="Percentage of trades closed with a profit in this month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'avgGain',
      label: (
        <div className="flex items-center gap-1">
          Avg Gain
          <Tooltip content="Average percentage gain for winning trades in this month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'avgLoss',
      label: (
        <div className="flex items-center gap-1">
          Avg Loss
          <Tooltip content="Average percentage loss for losing trades in this month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'avgRR',
      label: (
        <div className="flex items-center gap-1">
          Avg R:R
          <Tooltip content="Average reward-to-risk ratio for trades in this month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
    {
      key: 'avgHoldingDays',
      label: (
        <div className="flex items-center gap-1">
          Avg Days
          <Tooltip content="Average holding period (in days) for trades closed in this month." placement="top">
            <Icon icon="lucide:info" className="text-base text-foreground-400 cursor-pointer" />
          </Tooltip>
        </div>
      )
    },
  ];

  // Track the previous editingCell to only update editingValue when editing a new cell
  const prevEditingCell = React.useRef(editingCell);

  React.useEffect(() => {
    // Only run when editingCell changes to a new cell
    if (
      editingCell &&
      editingCell.col === 'addedWithdrawn' &&
      (prevEditingCell.current?.row !== editingCell.row || prevEditingCell.current?.col !== editingCell.col)
    ) {
      const rowIndex = editingCell.row;
      const item = computedData[rowIndex];
      if (!item) return;
      const month = item.month;
      const monthCapital = monthlyCapital.find(mc => mc.month === month);
      const year = monthCapital ? monthCapital.year : new Date().getFullYear();
      const existingChange = capitalChanges.find(change => {
        const d = new Date(change.date);
        return d.getMonth() === monthOrder.indexOf(month) && d.getFullYear() === year;
      });
      if (existingChange) {
        const sign = existingChange.type === 'deposit' ? 1 : -1;
        setEditingValue(String(existingChange.amount * sign));
      } else {
        setEditingValue('');
      }
    }
    prevEditingCell.current = editingCell;
  }, safeDeps([editingCell, computedData, capitalChanges, monthlyCapital]));

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-2">
          <Icon icon="lucide:info" className="text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-800 dark:text-blue-200">Important Note:</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Please ensure you set the <span className="font-semibold">Starting Capital</span> for each month before making any changes to the <span className="font-semibold">Added/Withdrawn</span> field. The Starting Capital is used as the base for all calculations.
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <label htmlFor="year-picker" className="font-medium">Year:</label>
        <select
          id="year-picker"
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          style={{ height: 32, borderRadius: 6, border: '1px solid #ccc', padding: '0 8px', fontSize: 16 }}
        >
          {getYearOptions().map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-default-200 dark:border-default-100">
        <Table 
          aria-label="Monthly performance table"
          classNames={{
            base: "min-w-[1200px]",
            th: "bg-default-100 dark:bg-default-800 text-foreground-600 dark:text-foreground-300 text-xs font-medium uppercase",
            td: "py-3 px-4 border-b border-default-200 dark:border-default-700"
          }}
        >
          <TableHeader columns={columns}>
            {(column) => (
              <TableColumn key={column.key} className="whitespace-nowrap">
                {column.label}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={computedData}>
            {(item) => (
              <TableRow key={item.month} className="group hover:bg-default-50 dark:hover:bg-default-800/60">
                {(columnKey) => {
                  if (columnKey === 'yearPlPercentage') return null;
                  const rowIndex = computedData.findIndex(d => d.month === item.month);
                const isEditing = editingCell && editingCell.row === rowIndex && editingCell.col === columnKey;
                    const value = item[columnKey as keyof typeof item];
                    if (columnKey === 'addedWithdrawn') {
                  if (isEditing) {
                    // Find the year for this month from monthlyCapital
                    const monthCapital = monthlyCapital.find(mc => mc.month === item.month);
                    const year = monthCapital ? monthCapital.year : new Date().getFullYear();
                    
                    // Find existing capital change for this month to pre-fill the value
                    const existingChange = capitalChanges.find(change => {
                      const d = new Date(change.date);
                      return d.getMonth() === monthOrder.indexOf(item.month) && 
                             d.getFullYear() === year;
                    });
                    
                    return (
                      <TableCell key={`${item.month}-${String(columnKey)}`}>
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            size="sm"
                            variant="bordered"
                            type="number"
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => handleSaveAddedWithdrawn(rowIndex, item.month, year)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                handleSaveAddedWithdrawn(rowIndex, item.month, year);
                              } else if (e.key === 'Escape') {
                                setEditingCell(null);
                                setEditingValue('');
                              }
                            }}
                            className="h-8 w-32 min-w-[8rem] bg-background dark:bg-default-100 border border-default-300 dark:border-default-700 hover:border-primary dark:hover:border-primary focus:border-primary dark:focus:border-primary text-sm text-foreground dark:text-foreground-200 text-right"
                            startContent={
                              <span className="text-foreground-500 text-sm pr-1">₹</span>
                            }
                          />
                          <Tooltip content="Save changes" placement="top">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onPress={() => handleSaveAddedWithdrawn(rowIndex, item.month, year)}
                            >
                              <Icon icon="lucide:check" className="h-4 w-4 text-success-500" />
                            </Button>
                          </Tooltip>
                        </div>
                      </TableCell>
                    );
                  }
                  const numValue = Number(value);
                  return (
                    <TableCell
                      key={`${item.month}-${String(columnKey)}`}
                      className="cursor-pointer"
                      onClick={() => {
                        setEditingCell({ row: rowIndex, col: columnKey });
                        setEditingValue(numValue === 0 ? "" : String(numValue));
                      }}
                    >
                      <span className={numValue < 0 ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400"}>
                        {numValue < 0
                          ? `Withdrawn ₹${Math.abs(numValue).toLocaleString()}`
                          : `Added ₹${numValue.toLocaleString()}`}
                      </span>
                    </TableCell>
                  );
                }
                
                if (columnKey === 'month') {
                  return (
                    <TableCell key={`${item.month}-${String(columnKey)}`}>
                      <span className="font-medium text-foreground dark:text-foreground-200">{value}</span>
                    </TableCell>
                      );
                    }
                    
                    if (columnKey === 'pl' || columnKey === 'plPercentage' || 
                        (typeof columnKey === 'string' && (columnKey === 'cagr' || columnKey.startsWith('rollingReturn')))) {
                      return (
                    <TableCell key={`${item.month}-${String(columnKey)}`}>
                        <span className={`${value !== '-' && Number(value) >= 0 ? "text-success-600 dark:text-success-400" : value !== '-' ? "text-danger-600 dark:text-danger-400" : ''}`}>
                          {value === '-' ? '-' : (columnKey === 'pl' ? Number(value).toLocaleString() : `${Number(value).toFixed(2)}%`)}
                        </span>
                    </TableCell>
                      );
                    }
                    
                    if (columnKey === 'winPercentage') {
                      return (
                    <TableCell key={`${item.month}-${String(columnKey)}`}>
                        <div className="flex items-center gap-1 text-foreground dark:text-foreground-200">
                          {value === '-' ? '-' : (
                            <>
                              {Number(value) > 0 ? (
                                <Icon icon="lucide:check" className="text-success-600 dark:text-success-400 w-3 h-3" />
                              ) : (
                                <Icon icon="lucide:x" className="text-danger-600 dark:text-danger-400 w-3 h-3" />
                              )}
                              {Number(value).toFixed(2)}%
                            </>
                          )}
                        </div>
                    </TableCell>
                      );
                    }
                    
                    if (columnKey === 'avgGain') {
                  return (
                    <TableCell key={`${item.month}-${String(columnKey)}`}>
                      {value === '-' ? '-' : (
                        Number(value) > 0 ? (
                          <span className="text-success-600 dark:text-success-400">{Number(value).toFixed(2)}%</span>
                        ) : <span className="text-foreground-500 dark:text-foreground-400">-</span>
                      )}
                    </TableCell>
                  );
                    }
                    
                    if (columnKey === 'avgLoss') {
                  return (
                    <TableCell key={`${item.month}-${String(columnKey)}`}>
                      {value === '-' ? '-' : (
                        <span className="text-danger-600 dark:text-danger-400">{Number(value).toFixed(2)}%</span>
                      )}
                    </TableCell>
                  );
                    }
                    
                    if (columnKey === 'avgRR') {
                      return (
                    <TableCell key={`${item.month}-${String(columnKey)}`}>
                        <span className={`${value !== '-' && Number(value) >= 0 ? "text-success-600 dark:text-success-400" : value !== '-' ? "text-danger-600 dark:text-danger-400" : ''}`}>
                          {value === '-' ? '-' : Number(value).toFixed(2)}
                        </span>
                    </TableCell>
                      );
                    }
                    
                    if (columnKey === 'startingCapital') {
                      const hasCustomSize = monthlyPortfolioSizes.some(
                        (size) => size.month === item.month && size.year === selectedYear && size.size > 0
                      );
                      
                      if (isEditing) {
                        return (
                          <TableCell key={`${item.month}-${String(columnKey)}`}>
                            <div className="flex items-center gap-2">
                              <Input
                                autoFocus
                                size="sm"
                                variant="bordered"
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => {
                                  const val = Number(editingValue);
                                  if (!isNaN(val) && val >= 0) {
                                    setPortfolioSize(val, item.month, selectedYear);
                                  }
                                  setEditingCell(null);
                                  setEditingValue("");
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const val = Number(editingValue);
                                    if (!isNaN(val) && val >= 0) {
                                      setPortfolioSize(val, item.month, selectedYear);
                                    }
                                    setEditingCell(null);
                                    setEditingValue("");
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null);
                                    setEditingValue("");
                                  }
                                }}
                                classNames={{
                                  inputWrapper: "h-8 min-h-0 bg-background dark:bg-default-100 border-default-300 dark:border-default-700 hover:border-primary dark:hover:border-primary focus-within:border-primary dark:focus-within:border-primary",
                                  input: "text-sm text-foreground dark:text-foreground-200 text-right"
                                }}
                                style={{ width: 120 }}
                                startContent={
                                  <span className="text-foreground-500 text-sm pr-1">₹</span>
                                }
                              />
                              <Tooltip content="Click to edit starting capital" placement="top">
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  onPress={() => {
                                    const val = Number(editingValue);
                                    if (!isNaN(val) && val >= 0) {
                                      setPortfolioSize(val, item.month, selectedYear);
                                    }
                                    setEditingCell(null);
                                    setEditingValue("");
                                  }}
                                >
                                  <Icon icon="lucide:check" className="h-4 w-4 text-success-500" />
                                </Button>
                              </Tooltip>
                            </div>
                          </TableCell>
                        );
                      }
                      
                      return (
                        <TableCell
                          key={`${item.month}-${String(columnKey)}`}
                          className="cursor-pointer group"
                          onClick={() => {
                            setEditingCell({ row: rowIndex, col: columnKey });
                            setEditingValue(value === '-' ? '' : String(value));
                          }}
                        >
                          <Tooltip 
                            content={
                              hasCustomSize 
                                ? `Custom portfolio size for ${item.month} ${selectedYear}` 
                                : `Using ${value === '-' ? 'default' : 'calculated'} portfolio size`
                            }
                            placement="top"
                          >
                            <motion.div 
                              whileHover={{ scale: 1.02 }} 
                              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                              className="flex items-center justify-end gap-1.5"
                            >
                              {hasCustomSize && (
                                <span className="text-primary-500 dark:text-primary-400">
                                  <Icon icon="lucide:star" className="h-3.5 w-3.5" />
                                </span>
                              )}
                              {value === '-' ? (
                                <span className="text-foreground-500 dark:text-foreground-400">-</span>
                              ) : (
                                <>
                                  <span className="text-foreground-500 text-sm">₹</span>
                                  <span className={`${hasCustomSize ? 'font-medium text-primary-600 dark:text-primary-400' : 'text-foreground dark:text-foreground-200'}`}>
                                    {Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </>
                              )}
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground-400">
                                <Icon icon="lucide:edit-2" className="h-3.5 w-3.5" />
                              </span>
                            </motion.div>
                          </Tooltip>
                        </TableCell>
                      );
                    }
                    
                    if (columnKey === 'finalCapital') {
                      return (
                        <TableCell key={`${item.month}-${String(columnKey)}`}>
                          <span className="text-foreground dark:text-foreground-200">{value === '-' ? '-' : Number(value).toLocaleString()}</span>
                        </TableCell>
                      );
                    }
                    
                    if (columnKey === 'avgHoldingDays') {
                      return (
                        <TableCell key={`${item.month}-${String(columnKey)}`}>
                          {value === '-' ? '-' : Number(value).toFixed(2)}
                        </TableCell>
                      );
                    }
                    
                    if (columnKey === 'trades') {
                      return (
                        <TableCell key={`${item.month}-${String(columnKey)}`}>
                          {value === '-' ? '-' : value}
                        </TableCell>
                      );
                    }
                    
                    return (
                      <TableCell key={`${item.month}-${String(columnKey)}`}>
                        <span className="text-foreground dark:text-foreground-200">{value}</span>
                      </TableCell>
                    );
                }}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}; 

// Defensive utility to ensure dependency arrays are always arrays
function safeDeps(deps: any) {
  return Array.isArray(deps) ? deps : [];
} 
