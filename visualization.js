let canvas, ctx;
let nodes = [];
let edges = [];
let teenPath = [];
let existingPath = [];
let metrics = null;
let isAnimating = false;
let animationPaused = false;
let animationStep = 0;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('vizCanvas');
    ctx = canvas.getContext('2d');
    
    document.getElementById('generateBtn').addEventListener('click', generateNetwork);
    document.getElementById('findPathBtn').addEventListener('click', findAndAnimatePath);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('resetBtn').addEventListener('click', resetAnimation);
    
    drawEmptyCanvas();
});

function drawEmptyCanvas() {
    ctx.fillStyle = '#f0f8ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#e8f4fc';
    ctx.lineWidth = 1;
    const gridSize = 50;
    
    for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

async function generateNetwork() {
    const numNodes = parseInt(document.getElementById('numNodes').value) || 50;
    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/generate_network', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ num_nodes: numNodes })
        });
        
        const data = await response.json();
        nodes = data.nodes;
        edges = data.edges;
        teenPath = [];
        existingPath = [];
        metrics = null;
        
        document.getElementById('vizMessage').style.display = 'none';
        document.getElementById('findPathBtn').disabled = false;
        document.getElementById('metricsSummary').style.display = 'none';
        
        updateStatus('Network Generated', 'ready');
        drawNetwork();
    } catch (error) {
        console.error('Error:', error);
        alert('Error generating network');
    } finally {
        btn.disabled = false;
    }
}

async function findAndAnimatePath() {
    const source = parseInt(document.getElementById('sourceNode').value);
    const destination = parseInt(document.getElementById('destNode').value);
    
    if (source < 0 || source >= nodes.length || destination < 0 || destination >= nodes.length) {
        alert(`Please enter valid node IDs (0 to ${nodes.length - 1})`);
        return;
    }
    
    if (source === destination) {
        alert('Source and destination must be different.');
        return;
    }
    
    const btn = document.getElementById('findPathBtn');
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/find_path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source, destination })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            btn.disabled = false;
            return;
        }
        
        teenPath = data.teen_path;
        existingPath = data.existing_path;
        metrics = data.metrics;
        
        updateMetricsDisplay();
        document.getElementById('metricsSummary').style.display = 'block';
        
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('resetBtn').disabled = false;
        
        startPathAnimation();
    } catch (error) {
        console.error('Error:', error);
        btn.disabled = false;
    }
}

function updateMetricsDisplay() {
    document.getElementById('teenLatency').textContent = metrics.teen.latency;
    document.getElementById('existingLatency').textContent = metrics.existing.latency;
    document.getElementById('teenMSE').textContent = metrics.teen.mse;
    document.getElementById('existingMSE').textContent = metrics.existing.mse;
    document.getElementById('teenBER').textContent = metrics.teen.ber;
    document.getElementById('existingBER').textContent = metrics.existing.ber;
    
    const latencyImprovement = ((metrics.existing.latency - metrics.teen.latency) / metrics.existing.latency * 100).toFixed(1);
    const mseImprovement = ((metrics.existing.mse - metrics.teen.mse) / metrics.existing.mse * 100).toFixed(1);
    const berImprovement = ((metrics.existing.ber - metrics.teen.ber) / metrics.existing.ber * 100).toFixed(1);
    
    document.getElementById('latencyImprovement').textContent = `${latencyImprovement}% better`;
    document.getElementById('mseImprovement').textContent = `${mseImprovement}% better`;
    document.getElementById('berImprovement').textContent = `${berImprovement}% better`;
}

function updateStatus(text, state) {
    const indicator = document.getElementById('statusIndicator');
    const dot = indicator.querySelector('.status-dot');
    const statusText = indicator.querySelector('.status-text');
    
    statusText.textContent = text;
    
    if (state === 'animating') {
        dot.style.background = '#ffc107';
        dot.style.animation = 'pulse 0.5s infinite';
    } else if (state === 'ready') {
        dot.style.background = '#28a745';
        dot.style.animation = 'pulse 2s infinite';
    } else if (state === 'paused') {
        dot.style.background = '#dc3545';
        dot.style.animation = 'none';
    }
}

function drawNetwork() {
    drawEmptyCanvas();
    
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    edges.forEach(edge => {
        const sourceNode = nodes[edge.source];
        const targetNode = nodes[edge.target];
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
    });
    
    const source = parseInt(document.getElementById('sourceNode').value);
    const destination = parseInt(document.getElementById('destNode').value);
    
    nodes.forEach((node, index) => {
        let color = node.is_cluster_head ? '#ffc107' : '#4a90d9';
        let radius = node.is_cluster_head ? 9 : 6;
        
        if (index === source) {
            color = '#28a745';
            radius = 11;
        } else if (index === destination) {
            color = '#dc3545';
            radius = 11;
        }
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

let animationId = null;
let pathProgress = 0;
let flashPhase = 0;

function startPathAnimation() {
    isAnimating = true;
    animationPaused = false;
    pathProgress = 0;
    flashPhase = 0;
    
    updateStatus('Animating Paths', 'animating');
    animate();
}

function animate() {
    if (!isAnimating) return;
    if (animationPaused) return;
    
    const speed = parseInt(document.getElementById('speedSlider').value);
    const progressIncrement = speed * 0.02;
    
    drawNetwork();
    
    if (existingPath.length > 1) {
        const existingProgress = Math.min(pathProgress * 0.7, 1);
        drawPathProgress(existingPath, existingProgress, '#dc3545', 4, true);
    }
    
    if (teenPath.length > 1) {
        const teenProgress = Math.min(pathProgress, 1);
        const flashIntensity = Math.sin(flashPhase) * 0.5 + 0.5;
        drawPathProgress(teenPath, teenProgress, '#28a745', 5 + flashIntensity * 2, false, flashIntensity);
    }
    
    pathProgress += progressIncrement;
    flashPhase += 0.15;
    
    if (pathProgress < 1.5) {
        animationId = requestAnimationFrame(animate);
    } else {
        continuousFlash();
    }
}

function continuousFlash() {
    if (!isAnimating || animationPaused) return;
    
    drawNetwork();
    
    if (existingPath.length > 1) {
        drawPathProgress(existingPath, 1, '#dc3545', 4, true);
    }
    
    if (teenPath.length > 1) {
        flashPhase += 0.1;
        const flashIntensity = Math.sin(flashPhase) * 0.5 + 0.5;
        drawPathProgress(teenPath, 1, '#28a745', 5 + flashIntensity * 3, false, flashIntensity);
    }
    
    animationId = requestAnimationFrame(continuousFlash);
}

function drawPathProgress(path, progress, color, lineWidth, dashed, glow = 0) {
    if (path.length < 2) return;
    
    const totalSegments = path.length - 1;
    const segmentsToShow = Math.floor(progress * totalSegments);
    const partialProgress = (progress * totalSegments) % 1;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    
    if (dashed) {
        ctx.setLineDash([10, 5]);
    } else {
        ctx.setLineDash([]);
    }
    
    if (glow > 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20 * glow;
    }
    
    ctx.beginPath();
    ctx.moveTo(nodes[path[0]].x, nodes[path[0]].y);
    
    for (let i = 0; i < segmentsToShow && i < totalSegments; i++) {
        ctx.lineTo(nodes[path[i + 1]].x, nodes[path[i + 1]].y);
    }
    
    if (segmentsToShow < totalSegments && partialProgress > 0) {
        const startNode = nodes[path[segmentsToShow]];
        const endNode = nodes[path[segmentsToShow + 1]];
        const x = startNode.x + (endNode.x - startNode.x) * partialProgress;
        const y = startNode.y + (endNode.y - startNode.y) * partialProgress;
        ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    
    for (let i = 0; i <= segmentsToShow && i < path.length; i++) {
        const node = nodes[path[i]];
        ctx.beginPath();
        ctx.arc(node.x, node.y, 8 + glow * 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(path[i], node.x, node.y);
    }
}

function togglePause() {
    animationPaused = !animationPaused;
    const btn = document.getElementById('pauseBtn');
    
    if (animationPaused) {
        btn.innerHTML = '<span class="icon">▶️</span> Resume';
        updateStatus('Paused', 'paused');
    } else {
        btn.innerHTML = '<span class="icon">⏸️</span> Pause';
        updateStatus('Animating', 'animating');
        if (pathProgress >= 1.5) {
            continuousFlash();
        } else {
            animate();
        }
    }
}

function resetAnimation() {
    isAnimating = false;
    animationPaused = false;
    pathProgress = 0;
    flashPhase = 0;
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    document.getElementById('findPathBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pauseBtn').innerHTML = '<span class="icon">⏸️</span> Pause';
    
    updateStatus('Ready', 'ready');
    drawNetwork();
}
