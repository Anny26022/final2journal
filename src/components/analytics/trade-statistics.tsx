import React from "react";
import { Tooltip, Input } from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { Trade } from "../../types/trade";
import { calcWeightedRewardRisk } from '../../utils/tradeCalculations';

interface StatProps {
  label: string;
  value: string | number;
  tooltip?: string;
  isPercentage?: boolean;
  index?: number;
}

const Stat: React.FC<StatProps> = ({ label, value, tooltip, isPercentage, index = 0 }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value.toString());
  const [isHovered, setIsHovered] = React.useState(false);
  
  return (
    <motion.div 
      className="relative overflow-hidden rounded-lg"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-primary-500/5 via-transparent to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: isHovered ? "0%" : "-100%" }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      />
      
      <motion.div 
        className="relative flex justify-between items-center p-3 backdrop-blur-sm bg-background/40 dark:bg-background/20 border border-foreground-200/10 dark:border-foreground-800/20"
        whileHover={{ x: 4 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground-700 dark:text-foreground-300">
            {label}
          </span>
          {tooltip && (
            <Tooltip 
              content={tooltip}
              classNames={{
                base: "py-2 px-4 shadow-soft-xl backdrop-blur-xl bg-background/80 dark:bg-background/40 border border-foreground-200/20",
                content: "text-sm text-foreground-700 dark:text-foreground-300"
              }}
            >
              <motion.span
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                className="cursor-help"
              >
                <Icon icon="lucide:info" className="w-4 h-4 text-foreground-400 dark:text-foreground-500" />
              </motion.span>
            </Tooltip>
          )}
        </div>
        
        <AnimatePresence mode="wait">
          {isEditing ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <Input
                size="sm"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditing(false)}
                autoFocus
                classNames={{
                  inputWrapper: "h-8 min-h-unit-8 bg-background/50 dark:bg-background/20 backdrop-blur-md",
                  input: "text-sm font-medium text-right"
                }}
                endContent={isPercentage && 
                  <span className="text-foreground-400 dark:text-foreground-500 text-sm">%</span>
                }
              />
            </motion.div>
          ) : (
            <motion.div 
              className="font-semibold text-sm cursor-pointer text-foreground-800 dark:text-foreground-200"
              onClick={() => setIsEditing(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              layout
            >
              {isPercentage ? `${value}%` : value}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

interface TradeStatisticsProps {
  trades: Trade[];
}

export const TradeStatistics: React.FC<TradeStatisticsProps> = ({ trades }) => {
  const totalTrades = trades.length;
  const winTrades = trades.filter(t => t.plRs > 0);
  const lossTrades = trades.filter(t => t.plRs < 0);
  const winRate = totalTrades > 0 ? (winTrades.length / totalTrades) * 100 : 0;
  const avgGain = winTrades.length > 0 ? winTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, t) => sum + (t.stockMove || 0), 0) / lossTrades.length : 0;
  const avgPositionSize = totalTrades > 0 ? trades.reduce((sum, t) => sum + (t.allocation || 0), 0) / totalTrades : 0;
  const avgHoldingDays = totalTrades > 0 ? trades.reduce((sum, t) => sum + (t.holdingDays || 0), 0) / totalTrades : 0;
  const avgR = totalTrades > 0 ? trades.reduce((sum, t) => sum + calcWeightedRewardRisk(t), 0) / totalTrades : 0;

  return (
    <div className="space-y-2">
      <Stat 
        label="Win %" 
        value={winRate.toFixed(2)} 
        isPercentage
        tooltip="Percentage of profitable trades in the last 12 months"
        index={0}
      />
      <Stat 
        label="Avg Gain" 
        value={avgGain.toFixed(2)} 
        isPercentage
        tooltip="Average percentage gain on winning trades"
        index={1}
      />
      <Stat 
        label="Avg Loss" 
        value={avgLoss.toFixed(2)} 
        isPercentage
        tooltip="Average percentage loss on losing trades"
        index={2}
      />
      <Stat 
        label="Avg Position Size" 
        value={avgPositionSize.toFixed(2)} 
        isPercentage
        tooltip="Average position size as percentage of portfolio"
        index={3}
      />
      <Stat 
        label="Avg Holding Days" 
        value={avgHoldingDays.toFixed(2)}
        tooltip="Average number of days positions are held"
        index={4}
      />
      <Stat 
        label="Avg R:R" 
        value={avgR.toFixed(2)}
        tooltip="Average reward-to-risk ratio across all trades (weighted, matches dashboard logic)"
        index={5}
      />
    </div>
  );
};