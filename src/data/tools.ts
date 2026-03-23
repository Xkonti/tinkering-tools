export interface Tool {
  name: string;
  icon: string;
  description: string;
  routePath: string;
}

export interface ToolCategory {
  name: string;
  icon: string;
  tools: Tool[];
}

export const toolCategories: readonly ToolCategory[] = [
  {
    name: 'Electronics',
    icon: 'memory',
    tools: [
      {
        name: 'Voltage Divider',
        icon: 'electric_bolt',
        description:
          'Calculate the output voltage of a resistive voltage divider circuit given input voltage, R1, and R2.',
        routePath: '/electronics/voltage-divider',
      },
    ],
  },
  {
    name: 'Woodworking',
    icon: 'carpenter',
    tools: [
      {
        name: 'Board Cut Optimizer',
        icon: 'content_cut',
        description:
          'Optimize 1D board cuts to minimize waste. Supports multiple stock types, kerf, and remnant tracking.',
        routePath: '/woodworking/board-cut-optimizer',
      },
    ],
  },
];
