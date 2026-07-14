let canvas, ctx;
let nodes = [];
let edges = [];
let teenPath = [];
let existingPath = [];
let isNetworkGenerated = false;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('networkCanvas');
    ctx = canvas.getContext('2d');
    
    document.getElementById('generateBtn').addEventListener('click', generateNetwork);
    document.getElementById('findPathBtn').addEventListener('click', findPath);
    
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
    btn.innerHTML = '<span class="icon">⏳</span> Generating...';
    
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
        isNetworkGenerated = true;
        
        document.getElementById('nodeCount').textContent = nodes.length;
        document.getElementById('edgeCount').textContent = edges.length;
        document.getElementById('canvasMessage').style.display = 'none';
        document.getElementById('findPathBtn').disabled = false;
        document.getElementById('pathInfo').style.display = 'none';
        
        const maxNodeId = nodes.length - 1;
        document.getElementById('sourceNode').max = maxNodeId;
        document.getElementById('destNode').max = maxNodeId;
        
        drawNetwork();
    } catch (error) {
        console.error('Error generating network:', error);
        alert('Error generating network. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon">🔄</span> Generate Network';
    }
}

async function findPath() {
    const source = parseInt(document.getElementById('sourceNode').value);
    const destination = parseInt(document.getElementById('destNode').value);
    const btn = document.getElementById('findPathBtn');
    
    if (source < 0 || source >= nodes.length || destination < 0 || destination >= nodes.length) {
        alert(`Please enter valid node IDs (0 to ${nodes.length - 1})`);
        return;
    }
    
    if (source === destination) {
        alert('Source and destination must be different nodes.');
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<span class="icon">⏳</span> Finding Path...';
    
    try {
        const response = await fetch('/api/find_path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source, destination })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        teenPath = data.teen_path;
        existingPath = data.existing_path;
        
        document.getElementById('teenLength').textContent = data.metrics.teen.hops;
        document.getElementById('teenWeight').textContent = data.teen_weight;
        document.getElementById('teenPath').textContent = teenPath.join(' → ');
        
        document.getElementById('existingLength').textContent = data.metrics.existing.hops;
        document.getElementById('existingWeight').textContent = data.existing_weight;
        document.getElementById('existingPath').textContent = existingPath.join(' → ');
        
        document.getElementById('pathInfo').style.display = 'block';
        
        drawNetwork();
        animateTeenPath();
    } catch (error) {
        console.error('Error finding path:', error);
        alert('Error finding path. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon">🔍</span> Find Optimal Path';
    }
}

function drawNetwork() {
    drawEmptyCanvas();
    
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    edges.forEach(edge => {
        const sourceNode = nodes[edge.source];
        const targetNode = nodes[edge.target];
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
    });
    
    if (existingPath.length > 1) {
        ctx.strokeStyle = '#dc3545';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(nodes[existingPath[0]].x, nodes[existingPath[0]].y);
        for (let i = 1; i < existingPath.length; i++) {
            ctx.lineTo(nodes[existingPath[i]].x, nodes[existingPath[i]].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    if (teenPath.length > 1) {
        ctx.strokeStyle = '#28a745';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(nodes[teenPath[0]].x, nodes[teenPath[0]].y);
        for (let i = 1; i < teenPath.length; i++) {
            ctx.lineTo(nodes[teenPath[i]].x, nodes[teenPath[i]].y);
        }
        ctx.stroke();
    }
    
    const source = parseInt(document.getElementById('sourceNode').value);
    const destination = parseInt(document.getElementById('destNode').value);
    
    nodes.forEach((node, index) => {
        let color = node.is_cluster_head ? '#ffc107' : '#4a90d9';
        let radius = node.is_cluster_head ? 10 : 7;
        
        if (teenPath.includes(index) || existingPath.includes(index)) {
            radius = 9;
        }
        
        if (index === source) {
            color = '#28a745';
            radius = 12;
        } else if (index === destination) {
            color = '#dc3545';
            radius = 12;
        }
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        if (node.is_cluster_head || index === source || index === destination || radius > 7) {
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(index, node.x, node.y - radius - 5);
        }
    });
}

let animationId = null;
let flashState = true;

function animateTeenPath() {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    function animate() {
        drawNetwork();
        
        if (teenPath.length > 1) {
            ctx.strokeStyle = flashState ? '#28a745' : '#90EE90';
            ctx.lineWidth = flashState ? 6 : 4;
            ctx.beginPath();
            ctx.moveTo(nodes[teenPath[0]].x, nodes[teenPath[0]].y);
            for (let i = 1; i < teenPath.length; i++) {
                ctx.lineTo(nodes[teenPath[i]].x, nodes[teenPath[i]].y);
            }
            ctx.stroke();
            
            if (flashState) {
                ctx.shadowColor = '#28a745';
                ctx.shadowBlur = 15;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
        
        flashState = !flashState;
        animationId = setTimeout(() => requestAnimationFrame(animate), 500);
    }
    
    animate();
}
