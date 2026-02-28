"""
Animated 3D Root3Power Logo Widget
Creates a rotating, glowing 3D logo animation
"""

from PyQt6.QtWidgets import QWidget
from PyQt6.QtCore import QTimer, QPropertyAnimation, QEasingCurve, pyqtProperty, Qt, QPointF
from PyQt6.QtGui import QPainter, QColor, QPen, QBrush, QLinearGradient, QRadialGradient, QPainterPath, QTransform
import math


class AnimatedRoot3PowerLogo(QWidget):
    """Animated 3D Root3Power logo with rotation and glow effects."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(120, 120)
        
        # Animation properties
        self._rotation = 0.0
        self._glow_intensity = 0.5
        self._scale = 1.0
        
        # Animation direction
        self._glow_direction = 1
        
        # Setup animations
        self.setup_animations()
        
    def setup_animations(self):
        """Setup rotation and glow animations."""
        # Rotation animation (continuous)
        self.rotation_animation = QPropertyAnimation(self, b"rotation")
        self.rotation_animation.setDuration(8000)  # 8 seconds for full rotation
        self.rotation_animation.setStartValue(0.0)
        self.rotation_animation.setEndValue(360.0)
        self.rotation_animation.setLoopCount(-1)  # Infinite loop
        self.rotation_animation.setEasingCurve(QEasingCurve.Type.Linear)
        self.rotation_animation.start()
        
        # Glow pulse animation
        self.glow_timer = QTimer(self)
        self.glow_timer.timeout.connect(self.update_glow)
        self.glow_timer.start(30)  # Update every 30ms for smooth animation
        
    def update_glow(self):
        """Update glow intensity for pulsing effect."""
        # Pulse between 0.3 and 1.0
        self._glow_intensity += 0.015 * self._glow_direction
        
        if self._glow_intensity >= 1.0:
            self._glow_intensity = 1.0
            self._glow_direction = -1
        elif self._glow_intensity <= 0.3:
            self._glow_intensity = 0.3
            self._glow_direction = 1
        
        self.update()
    
    @pyqtProperty(float)
    def rotation(self):
        return self._rotation
    
    @rotation.setter
    def rotation(self, value):
        self._rotation = value
        self.update()
    
    @pyqtProperty(float)
    def glow_intensity(self):
        return self._glow_intensity
    
    @glow_intensity.setter
    def glow_intensity(self, value):
        self._glow_intensity = value
        self.update()
    
    def paintEvent(self, event):
        """Paint the animated 3D logo."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        
        # Get widget dimensions
        width = self.width()
        height = self.height()
        size = min(width, height)
        
        # Center the logo
        painter.translate(width / 2, height / 2)
        
        # Apply rotation
        painter.rotate(self._rotation)
        
        # Scale to fit
        scale = size / 200.0
        painter.scale(scale, scale)
        
        # Draw the logo
        self.draw_3d_logo(painter)
        
    def draw_3d_logo(self, painter):
        """Draw the 3D Root3Power logo with animated number 3."""
        # Calculate 3D effect based on rotation
        angle_rad = math.radians(self._rotation)
        depth_offset = math.sin(angle_rad) * 8

        # Colors
        blue_bg = QColor(24, 95, 172)  # #185FAC
        blue_light = QColor(74, 158, 255)  # #4A9EFF
        blue_dark = QColor(15, 58, 115)  # #0F3A73
        black = QColor(0, 0, 0)
        white = QColor(255, 255, 255)

        # Glow color with intensity
        glow_color = QColor(74, 158, 255, int(100 * self._glow_intensity))

        # Draw outer glow
        for i in range(5, 0, -1):
            glow_pen = QPen(glow_color)
            glow_pen.setWidth(i * 2)
            painter.setPen(glow_pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawEllipse(-95, -95, 190, 190)

        # Draw background circle with 3D gradient
        gradient = QRadialGradient(QPointF(-30 + depth_offset, -30), 120)
        gradient.setColorAt(0.0, blue_light)
        gradient.setColorAt(0.5, blue_bg)
        gradient.setColorAt(1.0, blue_dark)

        painter.setPen(QPen(blue_dark, 2))
        painter.setBrush(QBrush(gradient))
        painter.drawEllipse(-85, -85, 170, 170)

        # Draw highlight for glossy effect
        highlight_gradient = QRadialGradient(QPointF(-25 + depth_offset, -35), 60)
        highlight_gradient.setColorAt(0.0, QColor(255, 255, 255, 80))
        highlight_gradient.setColorAt(1.0, QColor(255, 255, 255, 0))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(highlight_gradient))
        painter.drawEllipse(-60, -60, 80, 60)

        # Draw "3" number with 3D effect
        self.draw_number_3(painter, depth_offset, black, white)
        
    def draw_number_3(self, painter, depth_offset, shadow_color, text_color):
        """Draw a stylized 3D number '3'."""
        # Create path for the "3" shape
        path = QPainterPath()

        # Number 3 is made of two curved sections
        # Top curve
        path.moveTo(-20, -55)  # Top left
        path.lineTo(30, -55)   # Top right
        path.cubicTo(50, -55, 55, -40, 55, -25)  # Curve to middle right
        path.cubicTo(55, -10, 45, -5, 30, -5)    # Curve to middle
        path.lineTo(10, -5)    # Middle left
        path.lineTo(10, -20)   # Up a bit
        path.lineTo(25, -20)   # Right
        path.cubicTo(35, -20, 40, -25, 40, -30)  # Small curve
        path.cubicTo(40, -35, 35, -40, 25, -40)  # Back
        path.lineTo(-20, -40)  # Left
        path.closeSubpath()

        # Bottom curve
        bottom_path = QPainterPath()
        bottom_path.moveTo(10, 5)   # Middle left
        bottom_path.lineTo(30, 5)   # Middle right
        bottom_path.cubicTo(50, 5, 55, 20, 55, 35)   # Curve down right
        bottom_path.cubicTo(55, 50, 40, 55, 20, 55)  # Curve to bottom
        bottom_path.lineTo(-20, 55)  # Bottom left
        bottom_path.lineTo(-20, 40)  # Up
        bottom_path.lineTo(20, 40)   # Right
        bottom_path.cubicTo(35, 40, 40, 35, 40, 30)  # Small curve
        bottom_path.cubicTo(40, 25, 35, 20, 25, 20)  # Back
        bottom_path.lineTo(10, 20)   # Left
        bottom_path.closeSubpath()

        path.addPath(bottom_path)

        # Draw multiple shadow layers for depth
        for i in range(3, 0, -1):
            painter.save()
            offset = depth_offset * 0.3 * i
            painter.translate(offset, offset)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(QColor(0, 0, 0, 30 * i)))
            painter.drawPath(path)
            painter.restore()

        # Draw main number with gradient
        text_gradient = QLinearGradient(0, -55, 0, 55)
        text_gradient.setColorAt(0.0, text_color)
        text_gradient.setColorAt(0.5, QColor(240, 240, 240))
        text_gradient.setColorAt(1.0, QColor(200, 200, 200))

        painter.setPen(QPen(QColor(255, 255, 255, 200), 2))
        painter.setBrush(QBrush(text_gradient))
        painter.drawPath(path)

        # Draw inner highlight for 3D effect
        painter.setPen(QPen(QColor(255, 255, 255, 100), 1))
        painter.setBrush(Qt.BrushStyle.NoBrush)

        # Highlight path (slightly smaller)
        highlight_path = QPainterPath()
        highlight_path.moveTo(-15, -50)
        highlight_path.lineTo(28, -50)
        highlight_path.cubicTo(45, -50, 50, -38, 50, -25)
        painter.drawPath(highlight_path)
    
    def start_animation(self):
        """Start the animation."""
        if not self.rotation_animation.state() == QPropertyAnimation.State.Running:
            self.rotation_animation.start()
        if not self.glow_timer.isActive():
            self.glow_timer.start()
    
    def stop_animation(self):
        """Stop the animation."""
        self.rotation_animation.stop()
        self.glow_timer.stop()
    
    def pause_animation(self):
        """Pause the animation."""
        self.rotation_animation.pause()
        self.glow_timer.stop()
    
    def resume_animation(self):
        """Resume the animation."""
        self.rotation_animation.resume()
        self.glow_timer.start()


if __name__ == "__main__":
    """Test the animated logo."""
    import sys
    from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
    
    app = QApplication(sys.argv)
    
    window = QMainWindow()
    window.setWindowTitle("Animated Root3Power Logo Test")
    window.setStyleSheet("background-color: #0A0A0F;")
    
    central = QWidget()
    layout = QVBoxLayout(central)
    
    logo = AnimatedRoot3PowerLogo()
    logo.setFixedSize(200, 200)
    layout.addWidget(logo)
    
    window.setCentralWidget(central)
    window.resize(400, 400)
    window.show()
    
    sys.exit(app.exec())

