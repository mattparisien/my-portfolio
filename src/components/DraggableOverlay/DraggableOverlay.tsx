import { useEffect, useRef, useState } from "react";
import { fitImageToFrame } from "@/app/helpers";

interface DraggableOverlaytProps {
    items: {
        url: string;
        width: number;
        height: number;
        aspectRatio: number;
        type: "image" | "video";
    }[]
    onDragStart?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onDragEnd?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onDrag?: (event: React.MouseEvent<HTMLDivElement>) => void;
    style?: React.CSSProperties;
}

const DraggableOverlay = ({ items }: DraggableOverlaytProps) => {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [canvasItems, setCanvasItems] = useState<{
        x: number;
        y: number;
        w: number;
        h: number;
        img: HTMLImageElement;
    }[]>([]);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Initialize items and their positions
    useEffect(() => {
        if (canvasRef.current && items.length) {
            const cnv = canvasRef.current;
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            // Set canvas dimensions
            cnv.width = screenWidth;
            cnv.height = screenHeight;

            const maxWidth = Math.min(screenWidth, screenHeight) / 4;
            const maxHeight = maxWidth;

            // Store placed rectangles to check for overlaps
            const placedItems: { x: number; y: number; w: number; h: number }[] = [];

            // Helper function to check if two rectangles overlap
            const isOverlapping = (
                x1: number, y1: number, w1: number, h1: number,
                x2: number, y2: number, w2: number, h2: number
            ) => {
                return !(x1 + w1 < x2 || x2 + w2 < x1 || y1 + h1 < y2 || y2 + h2 < y1);
            };

            // Helper function to find a non-overlapping position
            const findNonOverlappingPosition = (w: number, h: number, maxAttempts = 100) => {
                const minX = 0;
                const maxX = screenWidth - w;
                const minY = 0;
                const maxY = screenHeight - h;

                for (let i = 0; i < maxAttempts; i++) {
                    const posX = Math.random() * (maxX - minX) + minX;
                    const posY = Math.random() * (maxY - minY) + minY;

                    // Check if this position overlaps with any existing items
                    const overlaps = placedItems.some(placed => 
                        isOverlapping(posX, posY, w, h, placed.x, placed.y, placed.w, placed.h)
                    );

                    if (!overlaps) {
                        return { posX, posY };
                    }
                }

                // If we can't find a non-overlapping position, return a random one
                return {
                    posX: Math.random() * (maxX - minX) + minX,
                    posY: Math.random() * (maxY - minY) + minY
                };
            };

            const newCanvasItems: typeof canvasItems = [];

            items.forEach((item, index) => {
                const { width, height } = fitImageToFrame(item.width, item.height, maxWidth, maxHeight);
                const w = width;
                const h = height;

                const { posX, posY } = findNonOverlappingPosition(w, h);

                // Store this item's position
                placedItems.push({ x: posX, y: posY, w, h });

                const img = new Image();
                img.src = item.url;
                img.onload = () => {
                    newCanvasItems.push({ x: posX, y: posY, w, h, img });
                    if (newCanvasItems.length === items.length) {
                        setCanvasItems(newCanvasItems);
                    }
                }
            })

        }
    }, [items])

    // Draw canvas
    useEffect(() => {
        if (canvasRef.current && canvasItems.length) {
            const cnv = canvasRef.current;
            const ctx = cnv.getContext("2d");
            if (!ctx) return;

            // Clear canvas
            ctx.clearRect(0, 0, cnv.width, cnv.height);

            // Draw all items except the dragged one
            canvasItems.forEach((item, index) => {
                if (index !== draggedIndex) {
                    ctx.drawImage(item.img, item.x, item.y, item.w, item.h);
                }
            });

            // Draw the dragged item last (on top)
            if (draggedIndex !== null && canvasItems[draggedIndex]) {
                const draggedItem = canvasItems[draggedIndex];
                ctx.drawImage(draggedItem.img, draggedItem.x, draggedItem.y, draggedItem.w, draggedItem.h);
            }
        }
    }, [canvasItems, draggedIndex]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const cnv = canvasRef.current;
        if (!cnv) return;

        const rect = cnv.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Check which item was clicked (reverse order to get topmost)
        for (let i = canvasItems.length - 1; i >= 0; i--) {
            const item = canvasItems[i];
            if (
                mouseX >= item.x &&
                mouseX <= item.x + item.w &&
                mouseY >= item.y &&
                mouseY <= item.y + item.h
            ) {
                setDraggedIndex(i);
                setDragOffset({
                    x: mouseX - item.x,
                    y: mouseY - item.y
                });
                break;
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (draggedIndex === null) return;

        const cnv = canvasRef.current;
        if (!cnv) return;

        const rect = cnv.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setCanvasItems(prev => {
            const newItems = [...prev];
            const item = newItems[draggedIndex];
            
            // Calculate new position with bounds checking
            let newX = mouseX - dragOffset.x;
            let newY = mouseY - dragOffset.y;

            // Keep within canvas bounds
            newX = Math.max(0, Math.min(newX, cnv.width - item.w));
            newY = Math.max(0, Math.min(newY, cnv.height - item.h));

            newItems[draggedIndex] = { ...item, x: newX, y: newY };
            return newItems;
        });
    };

    const handleMouseUp = () => {
        setDraggedIndex(null);
    };

    return (
        <canvas 
            ref={canvasRef} 
            className="fixed top-0 left-0 w-screen h-screen cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        />
    );
}

export default DraggableOverlay;