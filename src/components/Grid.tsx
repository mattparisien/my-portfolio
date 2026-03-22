import { useEffect, useRef } from "react";
import { MediaGridItem } from "./StickySections/StickySections";

interface GridProps {
    media: MediaGridItem[];
}



const Grid = ({ media }: GridProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);



    useEffect(() => {

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            const GRID_ITEM_SIZE = 300;
            const GRID_COLS = Math.trunc(window.innerWidth / GRID_ITEM_SIZE);
            const GRID_ROWS = Math.trunc(window.innerHeight / GRID_ITEM_SIZE);

            if (ctx) {
                ctx.fillStyle = "red";
                for (let i = 0; i < GRID_ROWS; i++) {
                    for (let j = 0; j < GRID_COLS; j++) {
                        
                    }
                }
            }
        }

    }, [media])

    return <canvas ref={canvasRef} className="w-screen h-screen fixed top-0 left-0 bg-black"></canvas>
}

export default Grid;